import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const APP_URL = process.env.APP_URL ?? 'https://cooking-master-tau.vercel.app';

async function getOrCreateFamilyGroup(userId) {
  const { data: prof } = await db.supabase
    .from('user_profiles')
    .select('family_group_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (prof?.family_group_id) return prof.family_group_id;

  const { data: userRow } = await db.supabase
    .from('users').select('name').eq('id', userId).single();

  const { data: group, error } = await db.supabase
    .from('family_groups')
    .insert({ created_by: userId, family_type: 'couple', shopping_day: 6 })
    .select('id').single();
  if (error) throw error;

  await db.supabase.from('family_members').insert({
    family_group_id: group.id,
    user_id: userId,
    name: userRow?.name ?? userId,
    role: 'owner',
    status: 'active',
    connected_at: new Date().toISOString(),
  });

  await db.supabase.from('user_profiles').upsert(
    { user_id: userId, family_group_id: group.id, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  return group.id;
}

export default async function handler(req, res) {
  try {
    // ── GET /api/invite?token=xxx — 공개: 토큰 검증 ──────────────
    if (req.method === 'GET') {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: 'token required' });

      const { data: invite, error } = await db.supabase
        .from('invite_tokens')
        .select('*, users!invite_tokens_invited_by_fkey(name, email)')
        .eq('token', token)
        .single();

      if (error || !invite) return res.status(404).json({ error: 'Invalid invite link' });
      if (invite.accepted_at)  return res.status(410).json({ error: 'already_used' });
      if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

      return res.json({
        token,
        inviter: { name: invite.users?.name ?? '누군가', email: invite.users?.email },
        expires_at: invite.expires_at,
      });
    }

    // 이하: 인증 필요
    const payload = verifyToken(req);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });
    const userId = payload.userId;

    // ── POST /api/invite — 초대 링크 생성 ──────────────────────
    if (req.method === 'POST') {
      const groupId = await getOrCreateFamilyGroup(userId);

      // 기존 유효 토큰 재사용
      const { data: existing } = await db.supabase
        .from('invite_tokens')
        .select('token, expires_at')
        .eq('invited_by', userId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return res.json({
          token: existing.token,
          url:   `${APP_URL}/join?token=${existing.token}`,
          expires_at: existing.expires_at,
        });
      }

      const { data: invite, error } = await db.supabase
        .from('invite_tokens')
        .insert({ invited_by: userId, family_group_id: groupId })
        .select('token, expires_at')
        .single();
      if (error) throw error;

      return res.status(201).json({
        token: invite.token,
        url:   `${APP_URL}/join?token=${invite.token}`,
        expires_at: invite.expires_at,
      });
    }

    // ── PUT /api/invite — 초대 수락 ──────────────────────────
    if (req.method === 'PUT') {
      const { token } = req.body ?? {};
      if (!token) return res.status(400).json({ error: 'token required' });

      const { data: invite, error: fetchErr } = await db.supabase
        .from('invite_tokens')
        .select('id, invited_by, accepted_at, expires_at, family_group_id')
        .eq('token', token)
        .single();

      if (fetchErr || !invite) return res.status(404).json({ error: 'Invalid token' });
      if (invite.accepted_at)  return res.status(409).json({ error: 'already_used' });
      if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });
      if (invite.invited_by === userId) return res.status(400).json({ error: 'self_invite' });

      // 초대자 family_group 확보
      const inviterGroupId = invite.family_group_id ?? await getOrCreateFamilyGroup(invite.invited_by);

      // 수락 처리
      await db.supabase.from('invite_tokens')
        .update({ accepted_by: userId, accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      const [acceptorUser, inviterUser] = await Promise.all([
        db.supabase.from('users').select('name').eq('id', userId).single(),
        db.supabase.from('users').select('name').eq('id', invite.invited_by).single(),
      ]);
      const acceptorName = acceptorUser.data?.name ?? userId;
      const inviterName  = inviterUser.data?.name ?? invite.invited_by;
      const now = new Date().toISOString();

      // pending 파트너 멤버 → 수락자로 업데이트 (없으면 신규 삽입)
      const { data: pendingMember } = await db.supabase
        .from('family_members')
        .select('id')
        .eq('family_group_id', inviterGroupId)
        .is('user_id', null)
        .eq('role', 'partner')
        .maybeSingle();

      if (pendingMember) {
        await db.supabase.from('family_members')
          .update({ user_id: userId, name: acceptorName, status: 'active', connected_at: now })
          .eq('id', pendingMember.id);
      } else {
        await db.supabase.from('family_members').upsert(
          { family_group_id: inviterGroupId, user_id: userId, name: acceptorName, role: 'partner', status: 'active', connected_at: now },
          { onConflict: 'family_group_id,user_id' },
        );
      }

      // 수락자 프로필에 family_group_id + partner_name 설정
      await db.supabase.from('user_profiles').upsert(
        { user_id: userId, family_group_id: inviterGroupId, partner_name: inviterName, updated_at: now },
        { onConflict: 'user_id' },
      );

      // 초대자 partner_name 업데이트
      await db.supabase.from('user_profiles').upsert(
        { user_id: invite.invited_by, partner_name: acceptorName, updated_at: now },
        { onConflict: 'user_id' },
      );

      // ── 식단 마이그레이션 ───────────────────────────────────────
      const [{ data: inviterMeals }, { data: acceptorMeals }] = await Promise.all([
        db.supabase.from('meal_plans').select('id, plan_date, meal_type')
          .eq('user_id', invite.invited_by).is('family_group_id', null),
        db.supabase.from('meal_plans').select('id, plan_date, meal_type')
          .eq('user_id', userId).is('family_group_id', null),
      ]);

      const inviterMap  = Object.fromEntries((inviterMeals ?? []).map(m => [`${m.plan_date}_${m.meal_type}`, m.id]));
      const acceptorMap = Object.fromEntries((acceptorMeals ?? []).map(m => [`${m.plan_date}_${m.meal_type}`, m.id]));
      const allKeys = new Set([...Object.keys(inviterMap), ...Object.keys(acceptorMap)]);

      const toKeep = [], toDelete = [];
      let conflictCount = 0;
      for (const key of allKeys) {
        const invId = inviterMap[key], accId = acceptorMap[key];
        if (invId && accId) {
          toKeep.push(invId); toDelete.push(accId); conflictCount++;
        } else if (invId) { toKeep.push(invId); }
        else               { toKeep.push(accId); }
      }

      await Promise.all([
        toDelete.length > 0 ? db.supabase.from('meal_plans').delete().in('id', toDelete) : null,
        toKeep.length  > 0 ? db.supabase.from('meal_plans').update({ family_group_id: inviterGroupId }).in('id', toKeep) : null,
      ]);

      return res.json({ ok: true, partner_name: inviterName, family_group_id: inviterGroupId, conflict_count: conflictCount });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[invite]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
