import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser(overrides) {
  const { token, user } = await registerUser(request, app, overrides);
  return { token, user, auth: { Authorization: `Bearer ${token}` } };
}

describe('GET /api/user/profile', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/user/profile');
    expect(res.status).toBe(401);
  });

  it('returns a default profile + planInfo for a brand-new user', async () => {
    const { auth } = await authedUser();
    const res = await request(app).get('/api/user/profile').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({});
    expect(res.body.members).toEqual([]);
    expect(res.body.planInfo).toMatchObject({ plan: 'free', plan_type: 'free', is_admin: false, is_test: false });
  });

  it('auto-grants admin to users whose email is in ADMIN_EMAILS', async () => {
    const { auth } = await authedUser({ email: 'admin@example.com' });
    const res = await request(app).get('/api/user/profile').set(auth);
    expect(res.body.planInfo.is_admin).toBe(true);
    expect(res.body.planInfo.plan_type).toBe('admin');
  });

  it('supports comma-separated ADMIN_EMAILS — second email is also recognized as admin', async () => {
    const { app: multiApp } = await setupTestApp({ ADMIN_EMAILS: 'admin@example.com,extra@example.com' });
    const { token } = await registerUser(request, multiApp, { email: 'extra@example.com' });
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(multiApp).get('/api/user/profile').set(auth);
    expect(res.body.planInfo.is_admin).toBe(true);
    expect(res.body.planInfo.plan_type).toBe('admin');
  });
});

describe('PUT /api/user/profile', () => {
  it('saves family settings, food_likes and allergies', async () => {
    const { auth } = await authedUser();
    const res = await request(app).put('/api/user/profile').set(auth).send({
      family_type: 'couple', food_likes: ['오트밀 죽'], allergies: ['새우'],
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.food_likes).toEqual(['오트밀 죽']);
    expect(res.body.profile.allergies).toEqual(['새우']);
  });

  it('creates a family group and a pending partner member when partner_name is set', async () => {
    const { auth } = await authedUser();
    const res = await request(app).put('/api/user/profile').set(auth).send({
      family_type: 'couple', partner_name: '배우자',
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.family_group_id).toBeTruthy();
    expect(res.body.members.some(m => m.role === 'partner' && m.status === 'pending' && m.name === '배우자')).toBe(true);
    expect(res.body.members.some(m => m.role === 'owner' && m.status === 'active')).toBe(true);
  });
});

describe('POST /api/user/profile (push subscription)', () => {
  it('stores a push subscription', async () => {
    const { auth } = await authedUser();
    const sub = { endpoint: 'https://push.example.com/x', keys: { p256dh: 'a', auth: 'b' } };
    const res = await request(app).post('/api/user/profile').set(auth).send({ push_subscription: sub });
    expect(res.status).toBe(200);

    const profile = await request(app).get('/api/user/profile').set(auth);
    expect(profile.body.profile.push_subscription).toEqual(sub);
  });

  it('clears a push subscription when null is sent', async () => {
    const { auth } = await authedUser();
    await request(app).post('/api/user/profile').set(auth).send({ push_subscription: { endpoint: 'x' } });
    await request(app).post('/api/user/profile').set(auth).send({ push_subscription: null });
    const profile = await request(app).get('/api/user/profile').set(auth);
    expect(profile.body.profile.push_subscription).toBeNull();
  });
});

describe('POST /api/user/profile?action=cancel', () => {
  it('rejects when the user has no active premium plan', async () => {
    const { auth } = await authedUser();
    const res = await request(app).post('/api/user/profile?action=cancel').set(auth).send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/user/profile?action=admin-grant', () => {
  it('rejects non-admin callers', async () => {
    const { auth } = await authedUser();
    const res = await request(app).post('/api/user/profile?action=admin-grant').set(auth)
      .send({ target_email: 'someone@example.com', grant: 'premium' });
    expect(res.status).toBe(403);
  });

  it('lets an admin grant premium to another user by email', async () => {
    const admin = await authedUser({ email: 'admin@example.com' });
    const target = await authedUser({ email: 'target@example.com' });
    await request(app).get('/api/user/profile').set(admin.auth); // triggers is_admin upsert

    const res = await request(app).post('/api/user/profile?action=admin-grant').set(admin.auth)
      .send({ target_email: 'target@example.com', grant: 'premium' });
    expect(res.status).toBe(200);

    const targetProfile = await request(app).get('/api/user/profile').set(target.auth);
    expect(targetProfile.body.planInfo.plan).toBe('premium');
  });
});

describe('DELETE /api/user/profile', () => {
  it('deletes the user and subsequent /me calls fail', async () => {
    const { auth } = await authedUser();
    const del = await request(app).delete('/api/user/profile').set(auth);
    expect(del.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set(auth);
    expect(me.status).toBe(401);
  });
});
