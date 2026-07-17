import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setupTestApp, registerUser } from './setupApp.js';

const RB_SECRET = 'test-rb-secret';

let app;
beforeAll(async () => {
  ({ app } = await setupTestApp({ RAREBOOK_JWT_SECRET: RB_SECRET, ADMIN_EMAILS: 'admin@example.com' }));
});

// www(IdP)가 발급하는 것과 동일한 형태의 rarebook SSO 토큰
function rbToken({ providerId = 'sso-1', provider = 'google', email = 'u@example.com', name = '통합유저' } = {}, secret = RB_SECRET) {
  return jwt.sign(
    { sub: `${provider}:${providerId}`, provider, provider_id: providerId, email, name },
    secret, { expiresIn: '1h' },
  );
}
const cookie = (tok) => [`rb_session=${tok}`];

describe('통합 SSO — rb_session 쿠키 인증 (requireAuth)', () => {
  it('rb_session 쿠키로 처음 접근하면 로컬 계정을 자동 생성하고 인증한다', async () => {
    const res = await request(app).get('/api/user/profile')
      .set('Cookie', cookie(rbToken({ providerId: 'new-1', email: 'new1@example.com' })));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('new1@example.com');
    expect(res.body.user.id).toBeTruthy();
  });

  it('같은 쿠키로 재접근하면 동일 계정을 재사용한다(중복 생성 없음)', async () => {
    const c = cookie(rbToken({ providerId: 'reuse-1', email: 'reuse@example.com' }));
    const first = await request(app).get('/api/user/profile').set('Cookie', c);
    const second = await request(app).get('/api/user/profile').set('Cookie', c);
    expect(first.body.user.id).toBe(second.body.user.id);
  });

  it('서명이 틀린 rb_session 은 401', async () => {
    const res = await request(app).get('/api/user/profile')
      .set('Cookie', cookie(rbToken({}, 'wrong-secret')));
    expect(res.status).toBe(401);
  });

  it('인증 정보가 전혀 없으면 401', async () => {
    const res = await request(app).get('/api/user/profile');
    expect(res.status).toBe(401);
  });

  it('기존 Bearer 토큰 방식은 그대로 동작한다(회귀)', async () => {
    const { token } = await registerUser(request, app, { providerId: 'bearer-1', email: 'b@example.com' });
    const res = await request(app).get('/api/user/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('b@example.com');
  });
});

describe('통합 SSO — 관리자 이메일 자동 부여', () => {
  it('ADMIN_EMAILS 에 포함된 이메일은 is_admin 이 된다', async () => {
    const res = await request(app).get('/api/user/profile')
      .set('Cookie', cookie(rbToken({ providerId: 'adm-1', email: 'admin@example.com' })));
    expect(res.status).toBe(200);
    expect(res.body.planInfo.is_admin).toBe(true);
  });

  it('일반 이메일은 is_admin 이 아니다', async () => {
    const res = await request(app).get('/api/user/profile')
      .set('Cookie', cookie(rbToken({ providerId: 'reg-1', email: 'regular@example.com' })));
    expect(res.status).toBe(200);
    expect(res.body.planInfo.is_admin).toBe(false);
  });
});
