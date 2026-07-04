import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getPlanType } from '../_limits.js';

const router = Router();

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY ?? '';
const TOSS_API_BASE   = 'https://api.tosspayments.com/v1';
const PLAN_PRICE_KRW   = 2900;
const getAdminEmails = () => (process.env.ADMIN_EMAILS ?? 'chiwon@gmail.com').split(',').map(e => e.trim().toLowerCase());

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
    body: JSON.stringify({ customerKey, amount: PLAN_PRICE_KRW, orderId, orderName: 'Cooking Master Premium 월 구독', customerEmail: customerEmail ?? undefined }),
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

function toPublicUser(u) {
  const fmt = v => (v instanceof Date ? v.toISOString() : v);
  return { id: u.id, provider: u.provider, name: u.name, email: u.email, avatar_url: u.avatar_url, created_at: fmt(u.created_at), last_login_at: fmt(u.last_login_at) };
}

function parseProfile(p) {
  if (!p) return {};
  return {
    ...p,
    children:      p.children ? JSON.parse(p.children) : [],
    food_likes:    p.food_likes ? JSON.parse(p.food_likes) : [],
    allergies:     p.allergies ? JSON.parse(p.allergies) : [],
    is_admin:      !!p.is_admin,
    is_test:       !!p.is_test,
    push_subscription: p.push_subscription ? JSON.parse(p.push_subscription) : null,
  };
}

async function ensureProfileRow(uid) {
  const existing = await db.getOne('SELECT user_id FROM user_profiles WHERE user_id = $1', [uid]);
  if (!existing) await db.run('INSERT INTO user_profiles (user_id) VALUES ($1)', [uid]);
}

async function getFamilyMembers(groupId) {
  if (!groupId) return [];
  return db.getMany(
    'SELECT id, user_id, name, role, status, invited_at, connected_at FROM family_members WHERE family_group_id = $1 ORDER BY invited_at',
    [groupId],
  );
}

async function ensureFamilyGroup({ uid, userName, familyType, partnerName, shoppingDay }) {
  const prof = await db.getOne('SELECT family_group_id FROM user_profiles WHERE user_id = $1', [uid]);
  let groupId = prof?.family_group_id;

  if (!groupId) {
    groupId = randomUUID();
    await db.run('INSERT INTO family_groups (id, created_by, family_type, shopping_day) VALUES ($1,$2,$3,$4)',
      [groupId, uid, familyType, shoppingDay]);
    await db.run(
      `INSERT INTO family_members (id, family_group_id, user_id, name, role, status, connected_at)
       VALUES ($1,$2,$3,$4,'owner','active',$5)`,
      [randomUUID(), groupId, uid, userName, new Date().toISOString()],
    );
  } else {
    await db.run('UPDATE family_groups SET family_type = $1, shopping_day = $2 WHERE id = $3', [familyType, shoppingDay, groupId]);
    await db.run('UPDATE family_members SET name = $1 WHERE family_group_id = $2 AND user_id = $3', [userName, groupId, uid]);
  }

  if (partnerName) {
    const existingPartner = await db.getOne(
      `SELECT id, user_id, status, name FROM family_members WHERE family_group_id = $1 AND role = 'partner'`,
      [groupId],
    );
    if (!existingPartner) {
      await db.run(
        `INSERT INTO family_members (id, family_group_id, user_id, name, role, status) VALUES ($1,$2,NULL,$3,'partner','pending')`,
        [randomUUID(), groupId, partnerName],
      );
    } else if (!existingPartner.user_id) {
      await db.run('UPDATE family_members SET name = $1 WHERE id = $2', [partnerName, existingPartner.id]);
    }
  }

  return groupId;
}

router.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  try {
    const [userRow, profileRow] = await Promise.all([
      db.getOne('SELECT * FROM users WHERE id = $1', [uid]),
      db.getOne('SELECT * FROM user_profiles WHERE user_id = $1', [uid]),
    ]);
    if (!userRow) return res.status(401).json({ error: 'User not found' });

    const isAdminEmail = getAdminEmails().includes((userRow.email ?? '').toLowerCase());
    if (isAdminEmail && !profileRow?.is_admin) {
      await ensureProfileRow(uid);
      await db.run('UPDATE user_profiles SET is_admin = 1, updated_at = $1 WHERE user_id = $2', [new Date().toISOString(), uid]);
    }

    const profile = parseProfile(profileRow);
    const members = await getFamilyMembers(profile.family_group_id);
    const effectiveIsAdmin = isAdminEmail || !!profile.is_admin;
    const planType = getPlanType({ ...profile, is_admin: effectiveIsAdmin });

    const planInfo = {
      plan: profile.plan ?? 'free',
      plan_expires_at: profile.plan_expires_at ?? null,
      plan_cancelled_at: profile.plan_cancelled_at ?? null,
      plan_start_at: profile.plan_start_at ?? null,
      ai_generate_count: profile.ai_generate_count ?? 0,
      ai_chat_turns: profile.ai_chat_turns ?? 0,
      ai_usage_month: profile.ai_usage_month ?? '',
      is_admin: effectiveIsAdmin,
      is_test: !!profile.is_test,
      plan_type: planType,
      billing_customer_key: profile.billing_customer_key ?? `cm_${uid}`,
      toss_client_key: process.env.TOSS_CLIENT_KEY ?? '',
    };

    res.json({ user: toPublicUser(userRow), profile, members, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null, planInfo });
  } catch (err) {
    console.error('[profile GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  try {
    const {
      family_type = 'couple', baby_birthday = null, baby_name = null, children = [],
      shopping_day = 6, partner_name = null, food_likes = [], allergies = [],
    } = req.body ?? {};

    let groupId = null;
    if (family_type !== 'solo' && partner_name) {
      const userRow = await db.getOne('SELECT name FROM users WHERE id = $1', [uid]);
      groupId = await ensureFamilyGroup({ uid, userName: userRow?.name ?? uid, familyType: family_type, partnerName: partner_name, shoppingDay: shopping_day });
    }

    const now = new Date().toISOString();
    await ensureProfileRow(uid);
    const existingProfile = await db.getOne('SELECT family_group_id FROM user_profiles WHERE user_id = $1', [uid]);
    const finalGroupId = groupId ?? existingProfile?.family_group_id ?? null;

    await db.run(
      `UPDATE user_profiles SET family_type=$1, baby_birthday=$2, baby_name=$3, children=$4, shopping_day=$5,
         partner_name=$6, food_likes=$7, allergies=$8, family_group_id=$9, updated_at=$10
       WHERE user_id = $11`,
      [family_type, baby_birthday, baby_name, JSON.stringify(Array.isArray(children) ? children : []),
       shopping_day, partner_name, JSON.stringify(food_likes), JSON.stringify(allergies), finalGroupId, now, uid],
    );

    const profileRow = await db.getOne('SELECT * FROM user_profiles WHERE user_id = $1', [uid]);
    const profile = parseProfile(profileRow);
    const members = await getFamilyMembers(profile.family_group_id);
    res.json({ profile, members });
  } catch (err) {
    console.error('[profile PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  const action = req.query.action;

  if (action === 'subscribe') {
    const { authKey, customerKey } = req.body ?? {};
    if (!authKey || !customerKey) return res.status(400).json({ error: 'authKey, customerKey 필요' });
    if (!TOSS_SECRET_KEY) return res.status(503).json({ error: '결제 서비스가 설정되지 않았습니다.' });

    try {
      const currentProfile = await db.getOne('SELECT plan, plan_expires_at, plan_cancelled_at FROM user_profiles WHERE user_id = $1', [uid]);
      const alreadyPremium = currentProfile?.plan === 'premium' && !currentProfile?.plan_cancelled_at &&
        currentProfile?.plan_expires_at && new Date(currentProfile.plan_expires_at) > new Date();
      if (alreadyPremium) return res.status(409).json({ error: '이미 활성화된 Premium 구독이 있습니다.' });

      const userRow = await db.getOne('SELECT email FROM users WHERE id = $1', [uid]);
      const { billingKey } = await tossIssueBillingKey(authKey, customerKey);
      const orderId = `cm_sub_${uid}_${Date.now()}`;
      await tossCharge({ billingKey, customerKey, customerEmail: userRow?.email, orderId });

      const now = new Date().toISOString();
      const expiresAt = nextMonthExpiry();
      await ensureProfileRow(uid);
      await db.run(
        `UPDATE user_profiles SET plan=$1, plan_expires_at=$2, plan_start_at=$3, plan_renewed_at=$4, plan_cancelled_at=NULL, billing_key=$5, billing_customer_key=$6, updated_at=$7 WHERE user_id=$8`,
        ['premium', expiresAt, now, now, billingKey, customerKey, now, uid],
      );
      return res.json({ ok: true, plan: 'premium', plan_expires_at: expiresAt });
    } catch (err) {
      console.error('[profile/subscribe]', err.message);
      return res.status(402).json({ error: err.message || '결제에 실패했습니다.' });
    }
  }

  if (action === 'cancel') {
    const cp = await db.getOne('SELECT plan, plan_cancelled_at FROM user_profiles WHERE user_id = $1', [uid]);
    if (cp?.plan !== 'premium') return res.status(400).json({ error: '활성 프리미엄 구독이 없습니다.' });
    if (cp?.plan_cancelled_at) return res.status(409).json({ error: '이미 해지 신청된 구독입니다.' });

    const now = new Date().toISOString();
    await db.run('UPDATE user_profiles SET plan_cancelled_at = $1, updated_at = $2 WHERE user_id = $3', [now, now, uid]);
    return res.json({ ok: true, message: '구독이 해지됩니다. 현재 구독 기간 만료 후 자동으로 Free 플랜으로 전환됩니다.' });
  }

  if (action === 'admin-grant') {
    const callerProfile = await db.getOne('SELECT is_admin FROM user_profiles WHERE user_id = $1', [uid]);
    const callerUser = await db.getOne('SELECT email FROM users WHERE id = $1', [uid]);
    const callerIsAdmin = !!callerProfile?.is_admin || getAdminEmails().includes((callerUser?.email ?? '').toLowerCase());
    if (!callerIsAdmin) return res.status(403).json({ error: 'Admin only' });

    const { target_email, grant } = req.body ?? {};
    if (!target_email || !grant) return res.status(400).json({ error: 'target_email, grant 필요' });

    const targetUser = await db.getOne('SELECT id FROM users WHERE email = $1', [target_email]);
    if (!targetUser) return res.status(404).json({ error: '해당 이메일의 사용자를 찾을 수 없습니다.' });

    const now = new Date().toISOString();
    await ensureProfileRow(targetUser.id);
    if (grant === 'test') {
      await db.run('UPDATE user_profiles SET is_test = 1, updated_at = $1 WHERE user_id = $2', [now, targetUser.id]);
    } else if (grant === 'premium') {
      await db.run('UPDATE user_profiles SET plan = $1, plan_expires_at = $2, updated_at = $3 WHERE user_id = $4',
        ['premium', nextMonthExpiry(), now, targetUser.id]);
    } else if (grant === 'free') {
      await db.run('UPDATE user_profiles SET plan = $1, is_test = 0, plan_expires_at = NULL, updated_at = $2 WHERE user_id = $3',
        ['free', now, targetUser.id]);
    }
    return res.json({ ok: true, target: target_email, grant });
  }

  // Push 알림 구독 등록/해제
  const { push_subscription } = req.body ?? {};
  const now = new Date().toISOString();
  await ensureProfileRow(uid);
  const subJson = push_subscription ? JSON.stringify(push_subscription) : null;
  await db.run('UPDATE user_profiles SET push_subscription = $1, updated_at = $2 WHERE user_id = $3', [subJson, now, uid]);
  res.json({ ok: true });
});

router.delete('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  try {
    await db.run('DELETE FROM meal_plans WHERE user_id = $1', [uid]);
    await db.run('DELETE FROM grocery_items WHERE user_id = $1', [uid]);
    await db.run('DELETE FROM user_profiles WHERE user_id = $1', [uid]);
    await db.run('DELETE FROM users WHERE id = $1', [uid]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[profile DELETE]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
