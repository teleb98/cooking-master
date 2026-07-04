import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser() {
  const { token } = await registerUser(request, app, {});
  return { Authorization: `Bearer ${token}` };
}

describe('POST /api/grocery (generate from meals)', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/grocery').send({ week_start: '2026-06-22' });
    expect(res.status).toBe(401);
  });

  it('requires week_start', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/grocery').set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('returns count 0 when no meals are planned that week', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/grocery').set(auth).send({ week_start: '2026-09-01' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('aggregates ingredients from planned meals into categorized grocery items', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-06-23', meal_type: 'lunch', menu_name: '닭가슴살 샐러드' });

    const gen = await request(app).post('/api/grocery').set(auth).send({ week_start: '2026-06-22' });
    expect(gen.status).toBe(200);
    expect(gen.body.count).toBeGreaterThan(0);

    const list = await request(app).get('/api/grocery?week_start=2026-06-22').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(gen.body.count);
    const oat = list.body.items.find(i => i.name === '오트밀');
    expect(oat.category).toBe('곡물·기타');
    expect(oat.is_bought).toBe(false);
  });

  it('replaces the previous list for the same week rather than appending', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).post('/api/grocery').set(auth).send({ week_start: '2026-06-22' });

    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '아보카도 토스트' });
    const second = await request(app).post('/api/grocery').set(auth).send({ week_start: '2026-06-22' });

    const list = await request(app).get('/api/grocery?week_start=2026-06-22').set(auth);
    expect(list.body.items.length).toBe(second.body.count);
    expect(list.body.items.some(i => i.name === '식빵')).toBe(true);
  });
});

describe('PUT /api/grocery (toggle bought)', () => {
  it('toggles is_bought for an item owned by the caller', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).post('/api/grocery').set(auth).send({ week_start: '2026-06-22' });
    const list = await request(app).get('/api/grocery?week_start=2026-06-22').set(auth);
    const item = list.body.items[0];

    const res = await request(app).put('/api/grocery').set(auth).send({ id: item.id, is_bought: true });
    expect(res.status).toBe(200);

    const after = await request(app).get('/api/grocery?week_start=2026-06-22').set(auth);
    expect(after.body.items.find(i => i.id === item.id).is_bought).toBe(true);
  });
});

describe('DELETE /api/grocery', () => {
  it('removes an item owned by the caller', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).post('/api/grocery').set(auth).send({ week_start: '2026-06-22' });
    const list = await request(app).get('/api/grocery?week_start=2026-06-22').set(auth);
    const item = list.body.items[0];

    const del = await request(app).delete('/api/grocery').set(auth).send({ id: item.id });
    expect(del.status).toBe(200);

    const after = await request(app).get('/api/grocery?week_start=2026-06-22').set(auth);
    expect(after.body.items.find(i => i.id === item.id)).toBeUndefined();
  });

  it('does not let one user delete another user\'s item', async () => {
    const userA = await authedUser();
    const userB = await authedUser();
    await request(app).put('/api/meals').set(userA)
      .send({ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).post('/api/grocery').set(userA).send({ week_start: '2026-06-22' });
    const list = await request(app).get('/api/grocery?week_start=2026-06-22').set(userA);
    const item = list.body.items[0];

    await request(app).delete('/api/grocery').set(userB).send({ id: item.id });
    const after = await request(app).get('/api/grocery?week_start=2026-06-22').set(userA);
    expect(after.body.items.find(i => i.id === item.id)).toBeTruthy();
  });
});
