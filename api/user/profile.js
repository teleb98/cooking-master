import { db, fmt } from '../_db.js';
import { verifyToken, toPublicUser } from '../_auth.js';

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

export default async function handler(req, res) {
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
      const members = await getFamilyMembers(profile?.family_group_id);
      return res.json({ user: toPublicUser(userRow, fmt), profile: profile ?? {}, members });
    }

    if (req.method === 'PUT') {
      const {
        family_type   = 'couple',
        baby_birthday = null,
        baby_name     = null,
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
        user_id: uid, family_type, baby_birthday, baby_name, shopping_day,
        partner_name, food_likes, allergies, updated_at: new Date().toISOString(),
      };
      if (groupId) profileData.family_group_id = groupId;

      const profile = await db.upsert('user_profiles', profileData, 'user_id');
      const resolvedGroupId = groupId ?? profile?.family_group_id;
      const members = await getFamilyMembers(resolvedGroupId);
      return res.json({ profile, members });
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
