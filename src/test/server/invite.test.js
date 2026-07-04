import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app, db;
beforeAll(async () => { ({ app, db } = await setupTestApp()); });

async function authedUser() {
  const { token, user } = await registerUser(request, app, {});
  return { auth: { Authorization: `Bearer ${token}` }, user };
}

describe('POST /api/invite', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/invite').send({});
    expect(res.status).toBe(401);
  });

  it('creates an invite link tied to a new family group', async () => {
    const { auth } = await authedUser();
    const res = await request(app).post('/api/invite').set(auth).send({});
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.url).toContain(res.body.token);
  });

  it('reuses an existing unexpired token instead of minting a new one', async () => {
    const { auth } = await authedUser();
    const first = await request(app).post('/api/invite').set(auth).send({});
    const second = await request(app).post('/api/invite').set(auth).send({});
    expect(second.status).toBe(200);
    expect(second.body.token).toBe(first.body.token);
  });
});

describe('GET /api/invite (public validation)', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/invite');
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app).get('/api/invite?token=does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns inviter info for a valid token, with no auth required', async () => {
    const { auth, user } = await authedUser();
    const created = await request(app).post('/api/invite').set(auth).send({});
    const res = await request(app).get(`/api/invite?token=${created.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.inviter.name).toBe(user.name);
  });

  it('returns 410 for an expired token', async () => {
    const { auth } = await authedUser();
    const created = await request(app).post('/api/invite').set(auth).send({});
    await db.run('UPDATE invite_tokens SET expires_at = $1 WHERE token = $2', ['2000-01-01T00:00:00.000Z', created.body.token]);
    const res = await request(app).get(`/api/invite?token=${created.body.token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('expired');
  });
});

describe('PUT /api/invite (accept)', () => {
  it('rejects an unknown token', async () => {
    const { auth } = await authedUser();
    const res = await request(app).put('/api/invite').set(auth).send({ token: 'nope' });
    expect(res.status).toBe(404);
  });

  it('rejects accepting your own invite', async () => {
    const { auth } = await authedUser();
    const created = await request(app).post('/api/invite').set(auth).send({});
    const res = await request(app).put('/api/invite').set(auth).send({ token: created.body.token });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('self_invite');
  });

  it('links two accounts into the same family group and sets partner_name both ways', async () => {
    const owner = await authedUser();
    const acceptor = await authedUser();
    const created = await request(app).post('/api/invite').set(owner.auth).send({});

    const accept = await request(app).put('/api/invite').set(acceptor.auth).send({ token: created.body.token });
    expect(accept.status).toBe(200);
    expect(accept.body.partner_name).toBe(owner.user.name);

    const ownerProfile = await request(app).get('/api/user/profile').set(owner.auth);
    const acceptorProfile = await request(app).get('/api/user/profile').set(acceptor.auth);
    expect(ownerProfile.body.profile.partner_name).toBe(acceptor.user.name);
    expect(acceptorProfile.body.profile.partner_name).toBe(owner.user.name);
    expect(ownerProfile.body.profile.family_group_id).toBe(acceptorProfile.body.profile.family_group_id);
  });

  it('rejects reusing an already-accepted token', async () => {
    const owner = await authedUser();
    const acceptor = await authedUser();
    const third = await authedUser();
    const created = await request(app).post('/api/invite').set(owner.auth).send({});
    await request(app).put('/api/invite').set(acceptor.auth).send({ token: created.body.token });

    const res = await request(app).put('/api/invite').set(third.auth).send({ token: created.body.token });
    expect(res.status).toBe(409);
  });

  it('migrates pre-existing personal meals into the shared family group, keeping the inviter\'s on conflict', async () => {
    const owner = await authedUser();
    const acceptor = await authedUser();

    await request(app).put('/api/meals').set(owner.auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).put('/api/meals').set(acceptor.auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '아보카도 토스트' }); // conflicting slot
    await request(app).put('/api/meals').set(acceptor.auth)
      .send({ plan_date: '2026-06-23', meal_type: 'lunch', menu_name: '비빔밥' }); // unique to acceptor

    const created = await request(app).post('/api/invite').set(owner.auth).send({});
    const accept = await request(app).put('/api/invite').set(acceptor.auth).send({ token: created.body.token });
    expect(accept.body.conflict_count).toBe(1);

    const shared = await request(app).get('/api/meals?week_start=2026-06-22').set(owner.auth);
    const conflictSlot = shared.body.meals.find(m => m.plan_date === '2026-06-22' && m.meal_type === 'breakfast');
    const uniqueSlot = shared.body.meals.find(m => m.plan_date === '2026-06-23' && m.meal_type === 'lunch');
    expect(conflictSlot.menu_name).toBe('오트밀 죽'); // inviter's wins
    expect(uniqueSlot.menu_name).toBe('비빔밥'); // acceptor's unique meal carried over
  });
});
