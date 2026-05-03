import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

export default async function handler(req, res) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const uid = payload.userId;

  if (req.method === 'GET') {
    try {
      const profile = await db.getOne('user_profiles', { user_id: uid });
      res.json({ profile: profile ?? {} });
    } catch (err) {
      console.error('[profile/get]', err);
      res.status(500).json({ error: 'Server error' });
    }

  } else if (req.method === 'PUT') {
    try {
      const {
        family_type   = 'couple',
        baby_birthday = null,
        shopping_day  = 6,
        partner_name  = null,
      } = req.body ?? {};

      const profile = await db.upsert(
        'user_profiles',
        {
          user_id: uid,
          family_type,
          baby_birthday,
          shopping_day,
          partner_name,
          updated_at: new Date().toISOString(),
        },
        'user_id',
      );

      res.json({ profile });
    } catch (err) {
      console.error('[profile/put]', err);
      res.status(500).json({ error: 'Server error' });
    }

  } else {
    res.status(405).end();
  }
}
