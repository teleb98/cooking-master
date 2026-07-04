import { Router } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const APP_URL = process.env.APP_URL ?? 'http://localhost:3002';

async function getOrCreateFamilyGroup(userId) {
  const prof = await db.getOne('SELECT family_group_id FROM user_profiles WHERE user_id = $1', [userId]);
  if (prof?.family_group_id) return prof.family_group_id;

  const userRow = await db.getOne('SELECT name FROM users WHERE id = $1', [userId]);
  const groupId = randomUUID();
  await db.run(
    'INSERT INTO family_groups (id, created_by, family_type, shopping_day) VALUES ($1,$2,$3,$4)',
    [groupId, userId, 'couple', 6],
  );
  await db.run(
    `INSERT INTO family_members (id, family_group_id, user_id, name, role, status, connected_at)
     VALUES ($1,$2,$3,$4,'owner','active',$5)`,
    [randomUUID(), groupId, userId, userRow?.name ?? userId, new Date().toISOString()],
  );
  const existingProfile = await db.getOne('SELECT user_id FROM user_profiles WHERE user_id = $1', [userId]);
  if (existingProfile) {
    await db.run('UPDATE user_profiles SET family_group_id = $1, updated_at = $2 WHERE user_id = $3',
      [groupId, new Date().toISOString(), userId]);
  } else {
    await db.run('INSERT INTO user_profiles (user_id, family_group_id, updated_at) VALUES ($1,$2,$3)',
      [userId, groupId, new Date().toISOString()]);
  }
  return groupId;
}

// GET /api/invite?token=xxx — 공개: 토큰 검증
router.get('/', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    const invite = await db.getOne(
      `SELECT it.*, u.name as inviter_name, u.email as inviter_email
       FROM invite_tokens it JOIN users u ON u.id = it.invited_by WHERE it.token = $1`,
      [token],
    );
    if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
    if (invite.accepted_at) return res.status(410).json({ error: 'already_used' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

    res.json({ token, inviter: { name: invite.inviter_name ?? '누군가', email: invite.inviter_email }, expires_at: invite.expires_at });
  } catch (err) {
    console.error('[invite GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const groupId = await getOrCreateFamilyGroup(userId);

    const existing = await db.getOne(
      `SELECT token, expires_at FROM invite_tokens WHERE invited_by = $1 AND accepted_at IS NULL AND expires_at > $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, new Date().toISOString()],
    );
    if (existing) {
      return res.json({ token: existing.token, url: `${APP_URL}/join?token=${existing.token}`, expires_at: existing.expires_at });
    }

    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.run(
      'INSERT INTO invite_tokens (id, token, invited_by, family_group_id, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), token, userId, groupId, expiresAt],
    );
    res.status(201).json({ token, url: `${APP_URL}/join?token=${token}`, expires_at: expiresAt });
  } catch (err) {
    console.error('[invite POST]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const { token } = req.body ?? {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const invite = await db.getOne(
      'SELECT id, invited_by, accepted_at, expires_at, family_group_id FROM invite_tokens WHERE token = $1', [token],
    );
    if (!invite) return res.status(404).json({ error: 'Invalid token' });
    if (invite.accepted_at) return res.status(409).json({ error: 'already_used' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });
    if (invite.invited_by === userId) return res.status(400).json({ error: 'self_invite' });

    const inviterGroupId = invite.family_group_id ?? await getOrCreateFamilyGroup(invite.invited_by);

    await db.run('UPDATE invite_tokens SET accepted_by = $1, accepted_at = $2 WHERE id = $3',
      [userId, new Date().toISOString(), invite.id]);

    const [acceptorUser, inviterUser] = await Promise.all([
      db.getOne('SELECT name FROM users WHERE id = $1', [userId]),
      db.getOne('SELECT name FROM users WHERE id = $1', [invite.invited_by]),
    ]);
    const acceptorName = acceptorUser?.name ?? userId;
    const inviterName  = inviterUser?.name ?? invite.invited_by;
    const now = new Date().toISOString();

    const pendingMember = await db.getOne(
      `SELECT id FROM family_members WHERE family_group_id = $1 AND user_id IS NULL AND role = 'partner'`,
      [inviterGroupId],
    );
    if (pendingMember) {
      await db.run('UPDATE family_members SET user_id = $1, name = $2, status = $3, connected_at = $4 WHERE id = $5',
        [userId, acceptorName, 'active', now, pendingMember.id]);
    } else {
      const existingMember = await db.getOne(
        'SELECT id FROM family_members WHERE family_group_id = $1 AND user_id = $2', [inviterGroupId, userId],
      );
      if (existingMember) {
        await db.run('UPDATE family_members SET name = $1, role = $2, status = $3, connected_at = $4 WHERE id = $5',
          [acceptorName, 'partner', 'active', now, existingMember.id]);
      } else {
        await db.run(
          `INSERT INTO family_members (id, family_group_id, user_id, name, role, status, connected_at)
           VALUES ($1,$2,$3,$4,'partner','active',$5)`,
          [randomUUID(), inviterGroupId, userId, acceptorName, now],
        );
      }
    }

    const acceptorProfile = await db.getOne('SELECT user_id FROM user_profiles WHERE user_id = $1', [userId]);
    if (acceptorProfile) {
      await db.run('UPDATE user_profiles SET family_group_id = $1, partner_name = $2, updated_at = $3 WHERE user_id = $4',
        [inviterGroupId, inviterName, now, userId]);
    } else {
      await db.run('INSERT INTO user_profiles (user_id, family_group_id, partner_name, updated_at) VALUES ($1,$2,$3,$4)',
        [userId, inviterGroupId, inviterName, now]);
    }
    await db.run('UPDATE user_profiles SET partner_name = $1, updated_at = $2 WHERE user_id = $3',
      [acceptorName, now, invite.invited_by]);

    const [inviterMeals, acceptorMeals] = await Promise.all([
      db.getMany('SELECT id, plan_date, meal_type FROM meal_plans WHERE user_id = $1 AND family_group_id IS NULL', [invite.invited_by]),
      db.getMany('SELECT id, plan_date, meal_type FROM meal_plans WHERE user_id = $1 AND family_group_id IS NULL', [userId]),
    ]);

    const inviterMap  = Object.fromEntries(inviterMeals.map(m => [`${m.plan_date}_${m.meal_type}`, m.id]));
    const acceptorMap = Object.fromEntries(acceptorMeals.map(m => [`${m.plan_date}_${m.meal_type}`, m.id]));
    const allKeys = new Set([...Object.keys(inviterMap), ...Object.keys(acceptorMap)]);

    const toKeep = [], toDelete = [];
    let conflictCount = 0;
    for (const key of allKeys) {
      const invId = inviterMap[key], accId = acceptorMap[key];
      if (invId && accId) { toKeep.push(invId); toDelete.push(accId); conflictCount++; }
      else if (invId) toKeep.push(invId);
      else toKeep.push(accId);
    }

    for (const id of toDelete) await db.run('DELETE FROM meal_plans WHERE id = $1', [id]);
    for (const id of toKeep) await db.run('UPDATE meal_plans SET family_group_id = $1 WHERE id = $2', [inviterGroupId, id]);

    res.json({ ok: true, partner_name: inviterName, family_group_id: inviterGroupId, conflict_count: conflictCount });
  } catch (err) {
    console.error('[invite PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
