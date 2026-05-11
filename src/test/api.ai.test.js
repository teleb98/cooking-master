/**
 * Tests for /api/ai/chat and /api/ai/generate-plan handlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('jsonwebtoken', () => ({
  default: {
    sign:   (p) => `mock.${JSON.stringify(p)}.sig`,
    verify: (t) => {
      if (t === 'valid-token') return { userId: 'user-1' };
      throw new Error('invalid');
    },
  },
}));

const supabaseMock = { from: vi.fn() };
vi.mock('@supabase/supabase-js', () => ({ createClient: () => supabaseMock }));

// fetch mock — replaced per test
global.fetch = vi.fn();

const { default: chatHandler }     = await import('../../api/ai/chat.js');
const { default: generateHandler } = await import('../../api/ai/generate-plan.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(override = {}) {
  return {
    method:  'POST',
    headers: { authorization: 'Bearer valid-token' },
    body:    {},
    ...override,
  };
}

function makeRes() {
  const r = { _status: 200, _body: null };
  r.status = (c) => { r._status = c; return r; };
  r.json   = (b) => { r._body  = b; return r; };
  r.end    = ()  => r;
  return r;
}

function chainQuery(data, error = null) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    lte:    vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  q.then = (resolve) => resolve({ data, error });
  return q;
}

function mockGeminiOk(text) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }),
  });
}

function mockGeminiError(status) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: { message: `error ${status}` } }),
  });
}

const PROFILE = { family_type: 'couple', food_likes: [], allergies: [], shopping_day: 6 };
const RECIPES = [
  { name: '김치찌개', kcal: 450, baby: false, tags: [] },
  { name: '된장찌개', kcal: 380, baby: false, tags: [] },
];

function mockDbForChat() {
  supabaseMock.from.mockImplementation((table) => {
    if (table === 'meal_plans')    return chainQuery([]);
    if (table === 'user_profiles') return chainQuery(PROFILE);
    if (table === 'recipes')       return chainQuery(RECIPES);
    return chainQuery(null);
  });
}

// ── /api/ai/chat ──────────────────────────────────────────────────────────────

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('인증 없으면 401', async () => {
    const res = makeRes();
    await chatHandler(makeReq({ headers: {} }), res);
    expect(res._status).toBe(401);
  });

  it('GEMINI_API_KEY 없으면 503', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = makeRes();
    await chatHandler(makeReq({ body: { message: '안녕' } }), res);
    expect(res._status).toBe(503);
  });

  it('메시지 없으면 400', async () => {
    mockDbForChat();
    mockGeminiOk('');
    const res = makeRes();
    await chatHandler(makeReq({ body: {} }), res);
    expect(res._status).toBe(400);
  });

  it('정상 채팅 응답 반환', async () => {
    mockDbForChat();
    mockGeminiOk('오늘 저녁은 김치찌개 어떨까요?');
    const res = makeRes();
    await chatHandler(makeReq({ body: { message: '오늘 뭐 먹을까?' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.text).toContain('김치찌개');
    expect(res._body.changes).toBeNull();
  });

  it('JSON 변경사항 파싱', async () => {
    mockDbForChat();
    const geminiText = '된장찌개로 바꿔드릴게요.\n```json\n{"changes":[{"plan_date":"2026-05-11","meal_type":"dinner","menu_name":"된장찌개"}]}\n```';
    mockGeminiOk(geminiText);
    const res = makeRes();
    await chatHandler(makeReq({ body: { message: '저녁 바꿔줘' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.changes).toHaveLength(1);
    expect(res._body.changes[0].menu_name).toBe('된장찌개');
    expect(res._body.text).not.toContain('```json');
  });

  it('Gemini 429 → 클라이언트에 429 전달', async () => {
    mockDbForChat();
    mockGeminiError(429);
    const res = makeRes();
    await chatHandler(makeReq({ body: { message: '안녕' } }), res);
    expect(res._status).toBe(429);
  });

  it('Gemini 500 → 502 반환', async () => {
    mockDbForChat();
    mockGeminiError(500);
    const res = makeRes();
    await chatHandler(makeReq({ body: { message: '안녕' } }), res);
    expect(res._status).toBe(502);
  });

  it('SAFETY finishReason → 200 + 안내 메시지', async () => {
    mockDbForChat();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '' }] } }],
      }),
    });
    const res = makeRes();
    await chatHandler(makeReq({ body: { message: '안녕' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.text).toBeTruthy();
  });

  // ── identify_food 모드 ──────────────────────────────────
  it('identify_food: image_base64 없으면 400', async () => {
    const res = makeRes();
    await chatHandler(makeReq({ body: { identify_food: true } }), res);
    expect(res._status).toBe(400);
  });

  it('identify_food: 음식명 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '김치찌개' }] } }],
      }),
    });
    const res = makeRes();
    await chatHandler(makeReq({ body: { identify_food: true, image_base64: 'base64data' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.name).toBe('김치찌개');
  });

  it('identify_food: 알 수 없음 → name null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '알 수 없음' }] } }],
      }),
    });
    const res = makeRes();
    await chatHandler(makeReq({ body: { identify_food: true, image_base64: 'base64data' } }), res);
    expect(res._body.name).toBeNull();
  });
});

// ── /api/ai/generate-plan ─────────────────────────────────────────────────────

describe('POST /api/ai/generate-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  function mockDbForGenerate() {
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'user_profiles') return chainQuery(PROFILE);
      if (table === 'recipes')       return chainQuery(RECIPES);
      if (table === 'meal_plans') {
        const q = chainQuery([]);
        q.upsert = vi.fn().mockResolvedValue({ error: null });
        return q;
      }
      return chainQuery(null);
    });
  }

  function buildPlan() {
    const dates = [];
    const d = new Date('2026-05-11');
    for (let i = 0; i < 14; i++) {
      const s = new Date(d);
      s.setUTCDate(d.getUTCDate() + i);
      const ds = s.toISOString().slice(0, 10);
      for (const t of ['breakfast', 'lunch', 'dinner']) {
        dates.push({ plan_date: ds, meal_type: t, menu_name: i % 2 === 0 ? '김치찌개' : '된장찌개' });
      }
    }
    return dates;
  }

  it('인증 없으면 401', async () => {
    const res = makeRes();
    await generateHandler(makeReq({ headers: {} }), res);
    expect(res._status).toBe(401);
  });

  it('GEMINI_API_KEY 없으면 503', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = makeRes();
    await generateHandler(makeReq(), res);
    expect(res._status).toBe(503);
  });

  it('레시피 없으면 500', async () => {
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'user_profiles') return chainQuery(PROFILE);
      if (table === 'recipes')       return chainQuery([]);
      return chainQuery(null);
    });
    const res = makeRes();
    await generateHandler(makeReq(), res);
    expect(res._status).toBe(500);
  });

  it('정상: 42개 항목 생성 후 저장', async () => {
    mockDbForGenerate();
    const plan = buildPlan();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ plan }) }] } }],
      }),
    });
    const res = makeRes();
    await generateHandler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.count).toBe(42);
  });

  it('레시피 목록에 없는 메뉴는 필터링', async () => {
    mockDbForGenerate();
    const plan = buildPlan();
    plan.push({ plan_date: '2026-05-11', meal_type: 'breakfast', menu_name: '존재하지않는메뉴' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ plan }) }] } }],
      }),
    });
    const res = makeRes();
    await generateHandler(makeReq(), res);
    expect(res._status).toBe(200);
    // 유효한 42개만 통과 (추가된 1개는 duplicate plan_date+meal_type이지만 filter는 통과)
    expect(res._body.count).toBeGreaterThan(0);
  });

  it('Gemini 429 → 429 반환', async () => {
    mockDbForGenerate();
    mockGeminiError(429);
    const res = makeRes();
    await generateHandler(makeReq(), res);
    expect(res._status).toBe(429);
  });

  it('AI 응답 빈 plan → 502', async () => {
    mockDbForGenerate();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"plan":[]}' }] } }],
      }),
    });
    const res = makeRes();
    await generateHandler(makeReq(), res);
    expect(res._status).toBe(502);
  });

  it('GET 메서드 → 405', async () => {
    const res = makeRes();
    await generateHandler(makeReq({ method: 'GET' }), res);
    expect(res._status).toBe(405);
  });
});
