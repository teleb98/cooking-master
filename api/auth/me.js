import { db, fmt } from '../_db.js';
import { verifyToken, toPublicUser } from '../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await db.getOne('users', { id: payload.userId });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: toPublicUser(user, fmt) });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Server error' });
  }
}
