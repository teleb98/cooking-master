import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');

export const signToken  = (userId) => jwt.sign({ userId }, SECRET, { expiresIn: '30d' });

export function verifyToken(req) {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.slice(7), SECRET); }
  catch { return null; }
}

export function toPublicUser(u, fmt) {
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
