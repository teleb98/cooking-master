import { randomUUID } from 'crypto';
import { db, fmt } from '../_db.js';
import { signToken, toPublicUser } from '../_auth.js';

const ALLOWED = new Set(['google', 'kakao', 'naver', 'facebook']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { provider, provider_id, name, email, avatar_url } = req.body ?? {};
  if (!provider || !provider_id || !name)
    return res.status(400).json({ error: 'provider, provider_id, name are required' });
  if (!ALLOWED.has(provider))
    return res.status(400).json({ error: 'Unknown provider' });

  try {
    const pid = String(provider_id);
    const existing = await db.getOne('users', { provider, provider_id: pid });

    let user;
    if (existing) {
      await db.update('users', { id: existing.id }, {
        name,
        email: email ?? null,
        last_login_at: new Date().toISOString(),
      });
      user = await db.getOne('users', { id: existing.id });
    } else {
      user = await db.insert('users', {
        id: randomUUID(),
        provider,
        provider_id: pid,
        name,
        email:      email      ?? null,
        avatar_url: avatar_url ?? null,
      });
    }

    res.json({
      token:  signToken(user.id),
      user:   toPublicUser(user, fmt),
      is_new: !existing,
    });
  } catch (err) {
    console.error('[auth/social]', err);
    res.status(500).json({ error: 'Server error' });
  }
}
