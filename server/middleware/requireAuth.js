import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cooking-master-dev-secret-change-in-prod';
// rarebook 통합 SSO — www(IdP)가 발급한 rb_session 쿠키를 검증할 공유 시크릿
const RB_SECRET = process.env.RAREBOOK_JWT_SECRET || 'rarebook-dev-secret-change-in-prod';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// rb_session 토큰의 (provider, provider_id) 로 로컬 users 행을 조회하거나 생성한다.
async function resolveRbUser(payload) {
  const provider = payload.provider;
  const pid = String(payload.provider_id ?? '');
  if (!provider || !pid) return null;

  const existing = await db.getOne(
    'SELECT id FROM users WHERE provider = $1 AND provider_id = $2',
    [provider, pid],
  );
  if (existing) return existing.id;

  const id = randomUUID();
  const name = payload.name || payload.email || 'rarebook 사용자';
  await db.run(
    'INSERT INTO users (id, provider, provider_id, name, email) VALUES ($1,$2,$3,$4,$5)',
    [id, provider, pid, name, payload.email ?? null],
  );
  return id;
}

export async function requireAuth(req, res, next) {
  // 1) 기존 방식: 자체 발급 Bearer 토큰 (localStorage)
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      req.userId = payload.userId;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // 2) 통합 SSO: rarebook 부모 도메인 쿠키 (rb_session)
  const rb = parseCookies(req.headers.cookie).rb_session;
  if (rb) {
    try {
      const payload = jwt.verify(rb, RB_SECRET);
      const userId = await resolveRbUser(payload);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      req.userId = userId;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid SSO session' });
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
}
