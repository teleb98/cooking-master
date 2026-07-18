import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser() {
  const { token } = await registerUser(request, app, {});
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/grocery/recommend', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/grocery/recommend');
    expect(res.status).toBe(401);
  });

  it('구매·식단 이력이 전혀 없으면 빈 추천 목록', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/grocery/recommend').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toEqual([]);
  });

  it('냉장고에 반복 등록(구매)된 재료를 추천한다', async () => {
    const auth = await authedUser();
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/fridge').set(auth)
        .send({ items: [{ name: '양파', qty: '1개', category: '채소' }] });
    }
    // 소비 처리(재고에서 제외돼야 재구매 추천에 뜸)
    const listed = await request(app).get('/api/fridge').set(auth);
    for (const it of listed.body.items) {
      await request(app).put('/api/fridge').set(auth).send({ id: it.id, consumed_at: new Date().toISOString() });
    }

    const res = await request(app).get('/api/grocery/recommend').set(auth);
    expect(res.status).toBe(200);
    const names = res.body.recommendations.map(r => r.name);
    expect(names).toContain('양파');
  });

  it('자주 계획한 메뉴(레시피 존재)의 재료를 추천한다', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-01', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-08', meal_type: 'breakfast', menu_name: '오트밀 죽' });

    const res = await request(app).get('/api/grocery/recommend').set(auth);
    expect(res.status).toBe(200);
    const names = res.body.recommendations.map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['오트밀', '우유', '바나나']));
  });

  it('현재 재고에 있는 재료는 추천에서 제외한다', async () => {
    const auth = await authedUser();
    await request(app).post('/api/fridge').set(auth)
      .send({ items: [{ name: '당근', qty: '1개', category: '채소' }, { name: '당근', qty: '1개', category: '채소' }] });
    // 소비하지 않고 그대로 재고에 남김 → 추천에서 제외되어야 함
    const res = await request(app).get('/api/grocery/recommend').set(auth);
    expect(res.body.recommendations.map(r => r.name)).not.toContain('당근');
  });

  it('week_start 를 넘기면 이번 주 장보기 목록에 이미 있는 재료는 제외한다', async () => {
    const auth = await authedUser();
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-01', meal_type: 'breakfast', menu_name: '오트밀 죽' });
    await request(app).put('/api/meals').set(auth)
      .send({ plan_date: '2026-07-08', meal_type: 'breakfast', menu_name: '오트밀 죽' });

    await request(app).post('/api/grocery').set(auth).send({
      week_start: '2026-07-06',
      items: [{ name: '오트밀', qty: '60g', category: '곡물·기타' }],
    });

    const res = await request(app).get('/api/grocery/recommend?week_start=2026-07-06').set(auth);
    const names = res.body.recommendations.map(r => r.name);
    expect(names).not.toContain('오트밀');
    expect(names).toContain('우유');
  });
});
