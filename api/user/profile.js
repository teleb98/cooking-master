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
        baby_name     = null,
        shopping_day  = 6,
        partner_name  = null,
        food_likes    = [],
        allergies     = [],
      } = req.body ?? {};

      const profile = await db.upsert(
        'user_profiles',
        { user_id: uid, family_type, baby_birthday, baby_name, shopping_day, partner_name, food_likes, allergies, updated_at: new Date().toISOString() },
        'user_id',
      );
      return res.json({ profile });
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
