import { db, fmt } from '../_db.js';
import { verifyToken, toPublicUser } from '../_auth.js';
import { getPlanType } from '../_limits.js';
import webpush from 'web-push';

const TOSS_SECRET_KEY  = process.env.TOSS_SECRET_KEY ?? '';
const TOSS_API_BASE    = 'https://api.tosspayments.com/v1';
const PLAN_PRICE_KRW   = 2900;
const ADMIN_EMAILS     = (process.env.ADMIN_EMAILS ?? 'chiwon@gmail.com').split(',').map(e => e.trim().toLowerCase());

function tossAuthHeader() {
  return `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`;
}

async function tossIssueBillingKey(authKey, customerKey) {
  const res = await fetch(`${TOSS_API_BASE}/billing/authorizations/issue`, {
    method: 'POST',
    headers: { Authorization: tossAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey, customerKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Toss issue billing key failed (${res.status})`);
  }
  return res.json();
}

async function tossCharge({ billingKey, customerKey, customerEmail, orderId }) {
  const res = await fetch(`${TOSS_API_BASE}/billing/${billingKey}`, {
    method: 'POST',
    headers: { Authorization: tossAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerKey,
      amount: PLAN_PRICE_KRW,
      orderId,
      orderName: 'Cooking Master Premium 월 구독',
      customerEmail: customerEmail ?? undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Toss charge failed (${res.status})`);
  }
  return res.json();
}

function nextMonthExpiry() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:chiwon@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

async function getFamilyMembers(groupId) {
  if (!groupId) return [];
  const { data } = await db.supabase
    .from('family_members')
    .select('id, user_id, name, role, status, invited_at, connected_at')
    .eq('family_group_id', groupId)
    .order('invited_at');
  return data ?? [];
}

async function ensureFamilyGroup({ uid, userName, familyType, partnerName, shoppingDay }) {
  const { data: prof } = await db.supabase
    .from('user_profiles')
    .select('family_group_id')
    .eq('user_id', uid)
    .maybeSingle();

  let groupId = prof?.family_group_id;

  if (!groupId) {
    const { data: group, error: gErr } = await db.supabase
      .from('family_groups')
      .insert({ created_by: uid, family_type: familyType, shopping_day: shoppingDay })
      .select('id')
      .single();
    if (gErr) throw gErr;
    groupId = group.id;

    await db.supabase.from('family_members').insert({
      family_group_id: groupId,
      user_id: uid,
      name: userName,
      role: 'owner',
      status: 'active',
      connected_at: new Date().toISOString(),
    });
  } else {
    await db.supabase.from('family_groups')
      .update({ family_type: familyType, shopping_day: shoppingDay })
      .eq('id', groupId);

    await db.supabase.from('family_members')
      .update({ name: userName })
      .eq('family_group_id', groupId)
      .eq('user_id', uid);
  }

  // 파트너 멤버 관리 (이미 연결된 파트너가 있으면 건드리지 않음)
  if (partnerName) {
    const { data: existingPartner } = await db.supabase
      .from('family_members')
      .select('id, user_id, status, name')
      .eq('family_group_id', groupId)
      .eq('role', 'partner')
      .maybeSingle();

    if (!existingPartner) {
      await db.supabase.from('family_members').insert({
        family_group_id: groupId,
        user_id: null,
        name: partnerName,
        role: 'partner',
        status: 'pending',
      });
    } else if (!existingPartner.user_id) {
      // pending 상태의 파트너 이름만 업데이트
      await db.supabase.from('family_members')
        .update({ name: partnerName })
        .eq('id', existingPartner.id);
    }
    // user_id가 있으면 이미 연결됨 → 이름/상태 변경 안 함
  }

  return groupId;
}

async function handleCronNotify(res) {
  // ── 1. Push 알림 발송 ────────────────────────────────────────
  const { data: profiles } = await db.supabase
    .from('user_profiles')
    .select('user_id, push_subscription')
    .not('push_subscription', 'is', null);

  const expiredIds = [];
  const pushResults = await Promise.allSettled(
    (profiles ?? []).map(async p => {
      try {
        await webpush.sendNotification(
          p.push_subscription,
          JSON.stringify({ title: 'Cooking Master', body: '오늘의 식단을 확인해보세요 🍱', url: '/calendar' }),
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) expiredIds.push(p.user_id);
        else throw err;
      }
    })
  );

  if (expiredIds.length) {
    await db.supabase.from('user_profiles')
      .update({ push_subscription: null })
      .in('user_id', expiredIds);
  }

  // ── 2. 만료 예정 프리미엄 구독 자동 결제 갱신 ───────────────
  const renewBefore = new Date();
  renewBefore.setDate(renewBefore.getDate() + 2); // 2일 이내 만료 예정

  const { data: toRenew } = await db.supabase
    .from('user_profiles')
    .select('user_id, billing_key, billing_customer_key, plan_expires_at, plan_cancelled_at')
    .eq('plan', 'premium')
    .not('billing_key', 'is', null)
    .is('plan_cancelled_at', null)
    .lte('plan_expires_at', renewBefore.toISOString());

  let renewed = 0, renewFailed = 0;
  if (TOSS_SECRET_KEY && (toRenew ?? []).length > 0) {
    const { data: users } = await db.supabase.from('users').select('id, email').in('id', toRenew.map(r => r.user_id));
    const emailMap = Object.fromEntries((users ?? []).map(u => [u.id, u.email]));

    await Promise.allSettled(
      toRenew.map(async r => {
        try {
          const orderId = `cm_renew_${r.user_id}_${Date.now()}`;
          await tossCharge({
            billingKey:    r.billing_key,
            customerKey:   r.billing_customer_key ?? `cm_${r.user_id}`,
            customerEmail: emailMap[r.user_id],
            orderId,
          });
          await db.supabase.from('user_profiles').update({
            plan_expires_at: nextMonthExpiry(),
            plan_renewed_at: new Date().toISOString(),
            updated_at:      new Date().toISOString(),
          }).eq('user_id', r.user_id);
          renewed++;
        } catch (err) {
          console.error(`[cron billing] renew failed for ${r.user_id}:`, err.message);
          renewFailed++;
        }
      })
    );
  }

  // ── 3. 해지된 구독 플랜 다운그레이드 ───────────────────────
  const { data: cancelled } = await db.supabase
    .from('user_profiles')
    .select('user_id')
    .eq('plan', 'premium')
    .not('plan_cancelled_at', 'is', null)
    .lte('plan_expires_at', new Date().toISOString());

  if ((cancelled ?? []).length > 0) {
    await db.supabase.from('user_profiles')
      .update({ plan: 'free', billing_key: null, updated_at: new Date().toISOString() })
      .in('user_id', cancelled.map(c => c.user_id));
  }

  const sent   = pushResults.filter(r => r.status === 'fulfilled').length - expiredIds.length;
  const failed = pushResults.filter(r => r.status === 'rejected').length;
  return res.json({ ok: true, sent, expired: expiredIds.length, failed, renewed, renewFailed, downgraded: cancelled?.length ?? 0 });
}

export default async function handler(req, res) {
  // Vercel Cron — no user auth, secured by CRON_SECRET
  if (req.method === 'GET' && req.query.cron === 'notify') {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try { return await handleCronNotify(res); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const uid = payload.userId;

  try {
    if (req.method === 'GET') {
      const [userRow, profile] = await Promise.all([
        db.getOne('users', { id: uid }),
        db.getOne('user_profiles', { user_id: uid }),
      ]);
      if (!userRow) return res.status(401).json({ error: 'User not found' });

      // ADMIN_EMAILS 환경변수로 관리자 자동 지정
      const isAdminEmail = ADMIN_EMAILS.includes((userRow.email ?? '').toLowerCase());
      if (isAdminEmail && !profile?.is_admin) {
        await db.supabase.from('user_profiles')
          .upsert({ user_id: uid, is_admin: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      }

      const members = await getFamilyMembers(profile?.family_group_id);
      const p = profile ?? {};
      const effectiveIsAdmin = isAdminEmail || !!p.is_admin;
      const planType = getPlanType({ ...p, is_admin: effectiveIsAdmin });

      const planInfo = {
        plan:                 p.plan ?? 'free',
        plan_expires_at:      p.plan_expires_at ?? null,
        plan_cancelled_at:    p.plan_cancelled_at ?? null,
        plan_start_at:        p.plan_start_at ?? null,
        ai_generate_count:    p.ai_generate_count ?? 0,
        ai_chat_turns:        p.ai_chat_turns ?? 0,
        ai_usage_month:       p.ai_usage_month ?? '',
        is_admin:             effectiveIsAdmin,
        is_test:              !!p.is_test,
        plan_type:            planType,  // 'free' | 'premium' | 'admin' | 'test'
        billing_customer_key: p.billing_customer_key ?? `cm_${uid}`,
        toss_client_key:      process.env.TOSS_CLIENT_KEY ?? '',
      };
      return res.json({ user: toPublicUser(userRow, fmt), profile: p, members, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null, planInfo });
    }

    if (req.method === 'PUT') {
      const {
        family_type   = 'couple',
        baby_birthday = null,
        baby_name     = null,
        children      = [],
        shopping_day  = 6,
        partner_name  = null,
        food_likes    = [],
        allergies     = [],
      } = req.body ?? {};

      let groupId = null;
      if (family_type !== 'solo' && partner_name) {
        const { data: userRow } = await db.supabase
          .from('users').select('name').eq('id', uid).single();
        groupId = await ensureFamilyGroup({
          uid,
          userName: userRow?.name ?? uid,
          familyType: family_type,
          partnerName: partner_name,
          shoppingDay: shopping_day,
        });
      }

      const profileData = {
        user_id: uid, family_type, baby_birthday, baby_name,
        children: Array.isArray(children) ? children : [],
        shopping_day, partner_name, food_likes, allergies,
        updated_at: new Date().toISOString(),
      };
      if (groupId) profileData.family_group_id = groupId;

      const profile = await db.upsert('user_profiles', profileData, 'user_id');
      const resolvedGroupId = groupId ?? profile?.family_group_id;
      const members = await getFamilyMembers(resolvedGroupId);
      return res.json({ profile, members });
    }

    if (req.method === 'POST') {
      const action = req.query.action;

      // ── 구독 시작 (Toss 카드 등록 완료 후) ──────────────────
      if (action === 'subscribe') {
        const { authKey, customerKey } = req.body ?? {};
        if (!authKey || !customerKey) return res.status(400).json({ error: 'authKey, customerKey 필요' });
        if (!TOSS_SECRET_KEY) return res.status(503).json({ error: '결제 서비스가 설정되지 않았습니다.' });

        // 중복 결제 방지: 이미 활성 프리미엄인지 확인
        const { data: currentProfile } = await db.supabase
          .from('user_profiles').select('plan, plan_expires_at, plan_cancelled_at').eq('user_id', uid).maybeSingle();
        const alreadyPremium = currentProfile?.plan === 'premium'
          && !currentProfile?.plan_cancelled_at
          && currentProfile?.plan_expires_at
          && new Date(currentProfile.plan_expires_at) > new Date();
        if (alreadyPremium) return res.status(409).json({ error: '이미 활성화된 Premium 구독이 있습니다.' });

        const userRow = await db.getOne('users', { id: uid });
        try {
          const { billingKey } = await tossIssueBillingKey(authKey, customerKey);
          const orderId = `cm_sub_${uid}_${Date.now()}`;
          await tossCharge({ billingKey, customerKey, customerEmail: userRow?.email, orderId });

          const now = new Date().toISOString();
          await db.supabase.from('user_profiles').upsert({
            user_id:              uid,
            plan:                 'premium',
            plan_expires_at:      nextMonthExpiry(),
            plan_start_at:        now,
            plan_renewed_at:      now,
            plan_cancelled_at:    null,
            billing_key:          billingKey,
            billing_customer_key: customerKey,
            updated_at:           now,
          }, { onConflict: 'user_id' });

          return res.json({ ok: true, plan: 'premium', plan_expires_at: nextMonthExpiry() });
        } catch (err) {
          console.error('[profile/subscribe]', err.message);
          return res.status(402).json({ error: err.message || '결제에 실패했습니다.' });
        }
      }

      // ── 구독 해지 ────────────────────────────────────────────
      if (action === 'cancel') {
        const { data: cp } = await db.supabase
          .from('user_profiles').select('plan, plan_cancelled_at').eq('user_id', uid).maybeSingle();
        if (cp?.plan !== 'premium') return res.status(400).json({ error: '활성 프리미엄 구독이 없습니다.' });
        if (cp?.plan_cancelled_at)  return res.status(409).json({ error: '이미 해지 신청된 구독입니다.' });

        const now = new Date().toISOString();
        await db.supabase.from('user_profiles').update({
          plan_cancelled_at: now,
          updated_at:        now,
        }).eq('user_id', uid);
        return res.json({ ok: true, message: '구독이 해지됩니다. 현재 구독 기간 만료 후 자동으로 Free 플랜으로 전환됩니다.' });
      }

      // ── 관리자 전용: 테스트 계정 / 플랜 수동 설정 ───────────
      if (action === 'admin-grant') {
        const { data: callerProfile } = await db.supabase.from('user_profiles')
          .select('is_admin').eq('user_id', uid).maybeSingle();
        const callerIsAdmin = !!callerProfile?.is_admin ||
          ADMIN_EMAILS.includes(((await db.getOne('users', { id: uid }))?.email ?? '').toLowerCase());

        if (!callerIsAdmin) return res.status(403).json({ error: 'Admin only' });

        const { target_email, grant } = req.body ?? {};
        if (!target_email || !grant) return res.status(400).json({ error: 'target_email, grant 필요' });

        const { data: targetUser } = await db.supabase.from('users').select('id').eq('email', target_email).maybeSingle();
        if (!targetUser) return res.status(404).json({ error: '해당 이메일의 사용자를 찾을 수 없습니다.' });

        const updates = { user_id: targetUser.id, updated_at: new Date().toISOString() };
        if (grant === 'test')    updates.is_test = true;
        if (grant === 'premium') { updates.plan = 'premium'; updates.plan_expires_at = nextMonthExpiry(); }
        if (grant === 'free')    { updates.plan = 'free'; updates.is_test = false; updates.plan_expires_at = null; }

        await db.supabase.from('user_profiles').upsert(updates, { onConflict: 'user_id' });
        return res.json({ ok: true, target: target_email, grant });
      }

      // ── Push 알림 구독 등록 (기존) ───────────────────────────
      const { push_subscription } = req.body ?? {};
      await db.supabase.from('user_profiles')
        .upsert({ user_id: uid, push_subscription, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      await Promise.all([
        db.supabase.from('meal_plans').delete().eq('user_id', uid),
        db.supabase.from('grocery_items').delete().eq('user_id', uid),
      ]);
      await db.supabase.from('user_profiles').delete().eq('user_id', uid);
      await db.supabase.from('users').delete().eq('id', uid);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[user/profile]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
