import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const OAUTH_KEYS = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET',
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET',
  'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET',
  'GEMINI_API_KEY', 'TOSS_SECRET_KEY', 'TOSS_CLIENT_KEY',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
];

/**
 * Spins up a fresh Express app backed by an isolated temp SQLite file.
 * Each test file calling this gets its own DB (vitest isolates modules per file).
 */
export async function setupTestApp(envOverrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cm-test-'));
  process.env.SQLITE_PATH = join(dir, 'test.db');
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.APP_URL = 'http://localhost:3002';
  process.env.ADMIN_EMAILS = 'admin@example.com';
  delete process.env.DATABASE_URL;
  for (const key of OAUTH_KEYS) delete process.env[key];
  for (const [k, v] of Object.entries(envOverrides)) process.env[k] = v;

  const { app } = await import('../../../server/app.js');
  const { default: db } = await import('../../../server/db.js');
  return { app, db };
}

/** Registers a user via the dev-only /api/auth/social route and returns { token, user }. */
export async function registerUser(request, app, { provider = 'google', providerId, name = '테스트유저', email } = {}) {
  const res = await request(app).post('/api/auth/social').send({
    provider,
    provider_id: providerId ?? `${provider}_${Math.random().toString(36).slice(2)}`,
    name,
    email,
  });
  return res.body;
}
