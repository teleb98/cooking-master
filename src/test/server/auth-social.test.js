import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

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
