import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cooking-master-dev-secret-change-in-prod';
const JWT_EXPIRES = '30d';
const ALLOWED_PROVIDERS = new Set(['google', 'kakao', 'naver', 'facebook']);

function toPublicUser(u) {
  const fmt = v => (v instanceof Date ? v.toISOString() : v);
  return {
    id:            u.id,
    provider:      u.provider,
    name:          u.name,
    email:         u.email,
    avatar_url:    u.avatar_url,
    created_at:    fmt(u.created_at),
    last_login_at: fmt(u.last_login_at),
  };
}

// POST /api/auth/social  — upsert user, return JWT
router.post('/social', async (req, res) => {
  try {
    const { provider, provider_id, name, email, avatar_url } = req.body ?? {};

    if (!provider || !provider_id || !name) {
      return res.status(400).json({ error: 'provider, provider_id, name are required' });
    }
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    const pid = String(provider_id);
    const existing = await db.getOne(
      'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
      [provider, pid],
    );

    let user;
    if (existing) {
      await db.run(
        'UPDATE users SET name = $1, email = $2, last_login_at = $3 WHERE id = $4',
        [name, email ?? null, new Date().toISOString(), existing.id],
      );
      user = await db.getOne('SELECT * FROM users WHERE id = $1', [existing.id]);
    } else {
      const id = randomUUID();
      await db.run(
        'INSERT INTO users (id, provider, provider_id, name, email, avatar_url) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, provider, pid, name, email ?? null, avatar_url ?? null],
      );
      user = await db.getOne('SELECT * FROM users WHERE id = $1', [id]);
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: toPublicUser(user), is_new: !existing });
  } catch (err) {
    console.error('[auth/social]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => res.json({ ok: true }));

// GET /api/auth/users  — dev only
router.get('/users', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Forbidden' });
  const users = await db.getMany('SELECT * FROM users ORDER BY created_at DESC');
  res.json({ users: users.map(toPublicUser) });
});

export default router;
