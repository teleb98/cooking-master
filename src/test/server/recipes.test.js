import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser() {
  const { token } = await registerUser(request, app, {});
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/recipes', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/recipes');
    expect(res.status).toBe(401);
  });

  it('returns the 100 seeded shared recipes', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/recipes').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.recipes.length).toBe(100);
    expect(res.body.recipes.every(r => r.user_id === null)).toBe(true);
  });

  it('returns a single recipe by name with ingredients parsed', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/recipes?name=오트밀 죽').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.recipe.name).toBe('오트밀 죽');
    expect(Array.isArray(res.body.recipe.ingredients)).toBe(true);
    expect(res.body.recipe.ingredients[0]).toHaveProperty('name');
  });

  it('returns null for a recipe name that does not exist', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/recipes?name=없는메뉴').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.recipe).toBeNull();
  });
});

describe('POST /api/recipes (create custom recipe)', () => {
  it('creates a custom recipe owned by the caller', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/recipes').set(auth)
      .send({ name: '내 요리', create: true, kcal: 500, tags: ['테스트'] });
    expect(res.status).toBe(200);
    expect(res.body.recipe.user_id).toBeTruthy();
    expect(res.body.recipe.kcal).toBe(500);
  });

  it('rejects a duplicate recipe name', async () => {
    const auth = await authedUser();
    await request(app).post('/api/recipes').set(auth).send({ name: '중복요리', create: true });
    const dup = await request(app).post('/api/recipes').set(auth).send({ name: '중복요리', create: true });
    expect(dup.status).toBe(409);
  });

  it('blocks free-plan users from creating more than 5 custom recipes', async () => {
    const auth = await authedUser();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/recipes').set(auth).send({ name: `한도요리${i}`, create: true });
      expect(res.status).toBe(200);
    }
    const sixth = await request(app).post('/api/recipes').set(auth).send({ name: '한도요리5', create: true });
    expect(sixth.status).toBe(402);
    expect(sixth.body.code).toBe('recipe_limit');
  });
});

describe('DELETE /api/recipes', () => {
  it('deletes a recipe owned by the caller', async () => {
    const auth = await authedUser();
    await request(app).post('/api/recipes').set(auth).send({ name: '삭제할요리', create: true });
    const del = await request(app).delete('/api/recipes').set(auth).send({ name: '삭제할요리' });
    expect(del.status).toBe(200);

    const lookup = await request(app).get('/api/recipes?name=삭제할요리').set(auth);
    expect(lookup.body.recipe).toBeNull();
  });

  it('does not delete a shared default recipe (no ownership match)', async () => {
    const auth = await authedUser();
    await request(app).delete('/api/recipes').set(auth).send({ name: '오트밀 죽' });
    const lookup = await request(app).get('/api/recipes?name=오트밀 죽').set(auth);
    expect(lookup.body.recipe).not.toBeNull();
  });
});

describe('POST /api/recipes (AI detail generation)', () => {
  it('returns 500 when GEMINI_API_KEY is not configured', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/recipes').set(auth).send({ name: '오트밀 죽' });
    expect(res.status).toBe(500);
  });

  it('generates and persists step detail via Gemini when configured', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth2 = (await registerUser(request, aiApp, {}));
    const authHeader = { Authorization: `Bearer ${auth2.token}` };

    const geminiPayload = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        steps: ['1단계', '2단계'], prep_time: 5, cook_time: 10, serving: 2, tips: '팁', nutrition: { protein_g: 10, carb_g: 20, fat_g: 5, fiber_g: 2 },
      }) }] } }],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => geminiPayload });

    const res = await request(aiApp).post('/api/recipes').set(authHeader).send({ name: '오트밀 죽' });
    expect(res.status).toBe(200);
    expect(res.body.recipe.steps).toEqual(['1단계', '2단계']);
    expect(res.body.recipe.tips).toBe('팁');

    const second = await request(aiApp).get('/api/recipes?name=오트밀 죽').set(authHeader);
    expect(second.body.recipe.steps).toEqual(['1단계', '2단계']);
  });
});
