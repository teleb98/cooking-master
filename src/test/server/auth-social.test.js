import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

describe('POST /api/auth/social — 보안: opt-in 플래그 없이는 항상 차단', () => {
  it('ALLOW_TEST_SOCIAL_LOGIN 이 꺼져 있으면(운영 기본값) 유효한 요청도 403', async () => {
    // 이 라우트는 실제 OAuth 검증 없이 클라이언트가 주장하는 provider_id 로 유효한
    // JWT를 발급하므로, opt-in 플래그가 없는 한(운영 기본값) 항상 막혀야 한다.
    // NODE_ENV 값에는 기대지 않는다 — 이 배포는 NODE_ENV=development 로 운영되므로.
    const prev = process.env.ALLOW_TEST_SOCIAL_LOGIN;
    delete process.env.ALLOW_TEST_SOCIAL_LOGIN;
    try {
      const res = await request(app).post('/api/auth/social')
        .send({ provider: 'google', provider_id: 'attacker-guessed-id', name: '아무나' });
      expect(res.status).toBe(403);
    } finally {
      process.env.ALLOW_TEST_SOCIAL_LOGIN = prev;
    }
  });
});

describe('GET /api/auth/users — 보안: 인증 없이 전체 회원 이메일을 나열하므로 opt-in 플래그 없이는 항상 차단', () => {
  it('ALLOW_TEST_SOCIAL_LOGIN 이 꺼져 있으면(운영 기본값) 403 — PII 유출 방지', async () => {
    // 실사고: NODE_ENV==='production' 가드에만 기대던 이전 코드가 이 배포에서
    // NODE_ENV=development 로 운영되는 바람에 무인증으로 라이브에 노출돼 있었다.
    const prev = process.env.ALLOW_TEST_SOCIAL_LOGIN;
    delete process.env.ALLOW_TEST_SOCIAL_LOGIN;
    try {
      const res = await request(app).get('/api/auth/users');
      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('users');
    } finally {
      process.env.ALLOW_TEST_SOCIAL_LOGIN = prev;
    }
  });
});

describe('POST /api/auth/social', () => {
  it('rejects when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/social').send({ provider: 'google' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown provider', async () => {
    const res = await request(app).post('/api/auth/social').send({ provider: 'github', provider_id: '1', name: 'x' });
    expect(res.status).toBe(400);
  });

  it('creates a new user on first login (is_new=true)', async () => {
    const res = await request(app).post('/api/auth/social')
      .send({ provider: 'google', provider_id: 'g-1', name: '철수', email: 'cs@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.is_new).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.name).toBe('철수');
  });

  it('returns the same user on repeat login (is_new=false)', async () => {
    const first = await request(app).post('/api/auth/social')
      .send({ provider: 'google', provider_id: 'g-2', name: '영희' });
    const second = await request(app).post('/api/auth/social')
      .send({ provider: 'google', provider_id: 'g-2', name: '영희(수정)' });
    expect(second.body.is_new).toBe(false);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.user.name).toBe('영희(수정)');
  });
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user for a valid token', async () => {
    const signup = await request(app).post('/api/auth/social')
      .send({ provider: 'google', provider_id: 'g-3', name: '민수' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signup.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('민수');
  });
});

describe('POST /api/auth/logout', () => {
  it('always returns ok', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
