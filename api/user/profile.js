import { db, fmt } from '../_db.js';
import { verifyToken, toPublicUser } from '../_auth.js';

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
      return res.json({ user: toPublicUser(userRow, fmt), profile: profile ?? {} });
    }

    if (req.method === 'PUT') {
      const {
        family_type   = 'couple',
        baby_birthday = null,
        shopping_day  = 6,
        partner_name  = null,
      } = req.body ?? {};

      const profile = await db.upsert(
        'user_profiles',
        { user_id: uid, family_type, baby_birthday, shopping_day, partner_name, updated_at: new Date().toISOString() },
        'user_id',
      );
      return res.json({ profile });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[user/profile]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
