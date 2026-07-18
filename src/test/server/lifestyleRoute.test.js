import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser() {
  const { token } = await registerUser(request, app, {});
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/lifestyle/health-signal', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/lifestyle/health-signal');
    expect(res.status).toBe(401);
  });

  it('식단 이력이 없으면 none/0', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/lifestyle/health-signal').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ score: 0, label: 'none', mealCount: 0 });
  });

  it('건강식 태그 메뉴 위주 식단이면 high 신호와 근거를 반환한다', async () => {
    const auth = await authedUser();
    const today = new Date().toISOString().slice(0, 10);
    // 닭가슴살 샐러드: 시드 레시피, tags=["샐러드","건강식"]
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: today, meal_type: 'breakfast', menu_name: '닭가슴살 샐러드' });
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: today, meal_type: 'lunch', menu_name: '닭가슴살 샐러드' });

    const res = await request(app).get('/api/lifestyle/health-signal').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(100);
    expect(res.body.label).toBe('high');
    expect(res.body.evidence).toContain('닭가슴살 샐러드');
  });

  it('90일 이전(기간 밖) 식단은 신호 계산에서 제외한다', async () => {
    const auth = await authedUser();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: oldDate.toISOString().slice(0, 10), meal_type: 'breakfast', menu_name: '닭가슴살 샐러드' });

    const res = await request(app).get('/api/lifestyle/health-signal').set(auth);
    expect(res.body).toMatchObject({ score: 0, label: 'none', mealCount: 0 });
  });
});
