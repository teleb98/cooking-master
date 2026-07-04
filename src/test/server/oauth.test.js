import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

describe('GET /api/auth/providers', () => {
  it('reports all providers as not configured when no env keys are set', async () => {
    const res = await request(app).get('/api/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body.configured).toEqual({ google: false, kakao: false, naver: false, facebook: false });
  });
});

describe('GET /api/auth/oauth', () => {
  it('redirects to /login?error=unknown_provider for an unknown provider', async () => {
    const res = await request(app).get('/api/auth/oauth?provider=bogus');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=unknown_provider');
  });

  it('redirects to /login?error=not_configured when the provider has no client id', async () => {
    const res = await request(app).get('/api/auth/oauth?provider=google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=not_configured&provider=google');
  });

  it('redirects to the real provider auth URL once configured, carrying state+redirect_uri', async () => {
    const { app: configuredApp } = await setupTestApp({ GOOGLE_CLIENT_ID: 'test-client-id' });
    const res = await request(configuredApp).get('/api/auth/oauth?provider=google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(res.headers.location).toContain('client_id=test-client-id');
    expect(res.headers.location).toContain(encodeURIComponent('http://localhost:3002/api/auth/callback'));
    expect(res.headers['set-cookie']?.[0]).toMatch(/^oauth_nonce=/);
  });
});

describe('GET /api/auth/callback', () => {
  it('redirects with error when the provider returned an error', async () => {
    const res = await request(app).get('/api/auth/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3002/login?error=access_denied');
  });

  it('redirects with invalid_request when code/state are missing', async () => {
    const res = await request(app).get('/api/auth/callback');
    expect(res.headers.location).toBe('http://localhost:3002/login?error=invalid_request');
  });

  it('redirects with invalid_state for an unparseable state param', async () => {
    const res = await request(app).get('/api/auth/callback?code=abc&state=not-base64-json');
    expect(res.headers.location).toBe('http://localhost:3002/login?error=invalid_state');
  });
});

describe('POST /api/auth/facebook-deletion', () => {
  it('rejects a request missing signed_request', async () => {
    const res = await request(app).post('/api/auth/facebook-deletion').send({});
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signed_request', async () => {
    const res = await request(app).post('/api/auth/facebook-deletion').send({ signed_request: 'garbage.notbase64' });
    expect(res.status).toBe(400);
  });
});
