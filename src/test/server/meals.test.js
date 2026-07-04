import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

// Mirrors server's local-time getMonday so test dates stay in sync with seeding
function getWeekStart(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, '0');
  const d = String(mon.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDaysToStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser() {
  const { token } = await registerUser(request, app, {});
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/meals', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/meals?week_start=2026-06-22');
    expect(res.status).toBe(401);
  });

  it('requires week_start or start+end', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/meals').set(auth);
    expect(res.status).toBe(400);
  });

  it('seeds a default 14-day plan on first access and returns only the requested week', async () => {
    const auth = await authedUser();
    const weekStart = getWeekStart(0);
    const weekEnd   = addDaysToStr(weekStart, 6);
    const res = await request(app).get(`/api/meals?week_start=${weekStart}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.meals.length).toBeGreaterThan(0);
    expect(res.body.meals.every(m => m.plan_date >= weekStart && m.plan_date <= weekEnd)).toBe(true);
    expect(res.body.is_connected).toBe(false);
  });

  it('does not re-seed on a second call (idempotent)', async () => {
    const auth = await authedUser();
    const weekStart = getWeekStart(0);
    await request(app).get(`/api/meals?week_start=${weekStart}`).set(auth);
    const second = await request(app).get(`/api/meals?week_start=${weekStart}`).set(auth);
    const third  = await request(app).get(`/api/meals?week_start=${weekStart}`).set(auth);
    expect(second.body.meals.length).toBe(third.body.meals.length);
  });

  it('supports an explicit start/end date range', async () => {
    const auth = await authedUser();
    const weekStart = getWeekStart(0);
    const dayTwo    = addDaysToStr(weekStart, 1);
    const res = await request(app).get(`/api/meals?start=${weekStart}&end=${dayTwo}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.meals.every(m => m.plan_date <= dayTwo)).toBe(true);
  });
});

describe('PUT /api/meals', () => {
  it('requires plan_date and meal_type', async () => {
    const auth = await authedUser();
    const res = await request(app).put('/api/meals').set(auth).send({ meal_type: 'breakfast' });
    expect(res.status).toBe(400);
  });

  it('saves a menu and looks up its kcal/baby flag from the recipes table', async () => {
    const auth = await authedUser();
    const res = await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-01', meal_type: 'lunch', menu_name: '닭가슴살 샐러드' });
    expect(res.status).toBe(200);

    const meals = await request(app).get('/api/meals?week_start=2026-06-29').set(auth);
    const saved = meals.body.meals.find(m => m.plan_date === '2026-07-01' && m.meal_type === 'lunch');
    expect(saved.menu_name).toBe('닭가슴살 샐러드');
    expect(saved.kcal).toBe(380);
  });

  it('clears a slot when menu_name is null', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-01', meal_type: 'dinner', menu_name: '제육볶음' });
    const clear = await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-01', meal_type: 'dinner', menu_name: null });
    expect(clear.status).toBe(200);

    const meals = await request(app).get('/api/meals?week_start=2026-06-29').set(auth);
    const saved = meals.body.meals.find(m => m.plan_date === '2026-07-01' && m.meal_type === 'dinner');
    expect(saved.menu_name).toBeNull();
  });

  it('updates an existing slot in place rather than duplicating rows', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-02', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-02', meal_type: 'breakfast', menu_name: '아보카도 토스트' });

    const meals = await request(app).get('/api/meals?week_start=2026-06-29').set(auth);
    const matching = meals.body.meals.filter(m => m.plan_date === '2026-07-02' && m.meal_type === 'breakfast');
    expect(matching.length).toBe(1);
    expect(matching[0].menu_name).toBe('아보카도 토스트');
  });
});

describe('Shared meals across a connected family group', () => {
  it('reflects one partner\'s PUT in the other partner\'s GET once connected', async () => {
    const owner = await authedUser();
    const partner = await authedUser();

    await request(app).put('/api/user/profile').set(owner).send({ family_type: 'couple', partner_name: '파트너' });
    const invite = await request(app).post('/api/invite').set(owner).send({});
    await request(app).put('/api/invite').set(partner).send({ token: invite.body.token });

    await request(app).put('/api/meals').set(owner)
      .send({ plan_date: '2026-08-01', meal_type: 'lunch', menu_name: '비빔밥' });

    const partnerMeals = await request(app).get('/api/meals?week_start=2026-07-27').set(partner);
    const shared = partnerMeals.body.meals.find(m => m.plan_date === '2026-08-01' && m.meal_type === 'lunch');
    expect(shared?.menu_name).toBe('비빔밥');
    expect(partnerMeals.body.is_connected).toBe(true);
  });
});
