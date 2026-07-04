import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

let app;
beforeAll(async () => { ({ app } = await setupTestApp()); });

async function authedUser(targetApp = app) {
  const { token } = await registerUser(request, targetApp, {});
  return { Authorization: `Bearer ${token}` };
}

describe('POST /api/ai/chat', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi' });
    expect(res.status).toBe(401);
  });

  it('returns 503 when GEMINI_API_KEY is not configured', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/ai/chat').set(auth).send({ message: 'hi' });
    expect(res.status).toBe(503);
  });
});

describe('POST /api/ai/generate-plan', () => {
  it('returns 503 when GEMINI_API_KEY is not configured', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/ai/generate-plan').set(auth).send({});
    expect(res.status).toBe(503);
  });
});

describe('AI routes with GEMINI_API_KEY configured', () => {
  it('identifies food from an image', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(aiApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '김치찌개' }] } }] }),
    });

    const res = await request(aiApp).post('/api/ai/chat').set(auth)
      .send({ identify_food: true, image_base64: 'aGVsbG8=', mime_type: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('김치찌개');
  });

  it('requires a message when not identifying food', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(aiApp);
    const res = await request(aiApp).post('/api/ai/chat').set(auth).send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns chat text and parses a trailing changes JSON block', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(aiApp);
    const replyText = '오트밀 죽으로 바꿔드릴게요.\n```json\n{"changes":[{"plan_date":"2026-06-22","meal_type":"breakfast","menu_name":"오트밀 죽"}]}\n```';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: replyText }] } }] }),
    });

    const res = await request(aiApp).post('/api/ai/chat').set(auth).send({ message: '아침 메뉴 바꿔줘' });
    expect(res.status).toBe(200);
    expect(res.body.text).toContain('오트밀 죽으로 바꿔드릴게요');
    expect(res.body.text).not.toContain('```');
    expect(res.body.changes).toEqual([{ plan_date: '2026-06-22', meal_type: 'breakfast', menu_name: '오트밀 죽' }]);
  });

  it('persists the chat usage counter for a user with no pre-existing profile row (regression)', async () => {
    const { app: aiApp, db } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const { token, user } = await registerUser(request, aiApp, {});
    const auth = { Authorization: `Bearer ${token}` };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '응답' }] } }] }),
    });

    await request(aiApp).post('/api/ai/chat').set(auth).send({ message: '아무거나' });
    const profile = await db.getOne('SELECT ai_chat_turns FROM user_profiles WHERE user_id = $1', [user.id]);
    expect(profile.ai_chat_turns).toBe(1);
  });

  it('enforces the free-tier monthly chat limit (5 turns)', async () => {
    const { app: aiApp, db } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const { token, user } = await registerUser(request, aiApp, {});
    const auth = { Authorization: `Bearer ${token}` };
    await db.run('INSERT INTO user_profiles (user_id, ai_chat_turns, ai_usage_month) VALUES ($1,5,$2)',
      [user.id, new Date().toISOString().slice(0, 7)]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '응답' }] } }] }),
    });

    const res = await request(aiApp).post('/api/ai/chat').set(auth).send({ message: '아무거나' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('upgrade_required');
  });

  it('generates a 14-day plan and saves valid entries, dropping invalid ones', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(aiApp);
    const plan = [
      { day: 1, meal_type: 'breakfast', menu_name: '오트밀 죽' },
      { day: 99, meal_type: 'breakfast', menu_name: '오트밀 죽' }, // invalid day, dropped
      { day: 2, meal_type: 'lunch', menu_name: '존재하지않는메뉴' }, // unknown recipe, dropped
    ];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ plan }) }] } }] }) });

    const res = await request(aiApp).post('/api/ai/generate-plan').set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.plan[0].menu_name).toBe('오트밀 죽');
  });

  it('returns 502 when Gemini produces no usable plan entries', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(aiApp);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ plan: [] }) }] } }] }) });

    const res = await request(aiApp).post('/api/ai/generate-plan').set(auth).send({});
    expect(res.status).toBe(502);
  });

  it('system prompt includes today\'s local date and week anchors (date bug regression)', async () => {
    const { app: aiApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(aiApp);

    let capturedBody;
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '응답' }] } }] }) };
    });

    await request(aiApp).post('/api/ai/chat').set(auth).send({ message: '다음 주 식단 짜줘' });

    const sysText = capturedBody?.systemInstruction?.parts?.[0]?.text ?? '';
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    expect(sysText).toContain(`오늘: ${todayStr}`);
    expect(sysText).toContain('이번 주:');
    expect(sysText).toContain('다음 주:');
    // Next week's Monday must start on Monday (verify it's not a UTC-shifted Tuesday)
    const nextWeekMatch = sysText.match(/다음 주: (\d{4}-\d{2}-\d{2})\(월\)/);
    expect(nextWeekMatch).not.toBeNull();
    const nextMonday = new Date(nextWeekMatch[1] + 'T00:00:00');
    expect(nextMonday.getDay()).toBe(1); // Must be Monday in local time
  });
});
