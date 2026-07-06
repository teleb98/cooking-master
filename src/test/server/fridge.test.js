import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestApp, registerUser } from './setupApp.js';

// 공유 앱 인스턴스 (OCR 테스트는 GEMINI_API_KEY 필요하여 별도 인스턴스 사용)
let app, db;
beforeAll(async () => { ({ app, db } = await setupTestApp()); });
beforeEach(() => vi.restoreAllMocks());

async function authedUser(targetApp = app) {
  const { token } = await registerUser(request, targetApp, {});
  return { Authorization: `Bearer ${token}` };
}

// ── GET /api/fridge ───────────────────────────────────────────────────────────

describe('GET /api/fridge', () => {
  it('401 without auth', async () => {
    const res = await request(app).get('/api/fridge');
    expect(res.status).toBe(401);
  });

  it('returns empty items array for new user', async () => {
    const auth = await authedUser();
    const res = await request(app).get('/api/fridge').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('returns items sorted by expires_at ascending', async () => {
    const auth = await authedUser();
    await request(app).post('/api/fridge').set(auth).send({ name: '배추', qty: '1포기', category: '채소',  expires_at: '2030-12-31' });
    await request(app).post('/api/fridge').set(auth).send({ name: '소고기', qty: '500g', category: '육류', expires_at: '2030-12-15' });
    const res = await request(app).get('/api/fridge').set(auth);
    expect(res.status).toBe(200);
    const names = res.body.items.map(i => i.name);
    expect(names.indexOf('소고기')).toBeLessThan(names.indexOf('배추'));
  });

  it('excludes consumed items', async () => {
    const auth = await authedUser();
    await request(app).post('/api/fridge').set(auth).send({ name: '우유_소비됨', qty: '1L', category: '유제품' });
    const listRes = await request(app).get('/api/fridge').set(auth);
    const item = listRes.body.items.find(i => i.name === '우유_소비됨');
    await request(app).put('/api/fridge').set(auth).send({ id: item.id, consumed_at: new Date().toISOString() });
    const res = await request(app).get('/api/fridge').set(auth);
    expect(res.body.items.find(i => i.name === '우유_소비됨')).toBeUndefined();
  });

  it('does not expose other users items', async () => {
    const { app: isolatedApp } = await setupTestApp();
    const auth1 = await authedUser(isolatedApp);
    const auth2 = await authedUser(isolatedApp);
    await request(isolatedApp).post('/api/fridge').set(auth1).send({ name: '남의_사과', qty: '3개', category: '과일' });
    const res = await request(isolatedApp).get('/api/fridge').set(auth2);
    expect(res.body.items.find(i => i.name === '남의_사과')).toBeUndefined();
  });
});

// ── POST /api/fridge — 단일/일괄 저장 ────────────────────────────────────────

describe('POST /api/fridge — save', () => {
  it('401 without auth', async () => {
    const res = await request(app).post('/api/fridge').send({ name: '사과', qty: '3개' });
    expect(res.status).toBe(401);
  });

  it('saves a single item and returns saved array', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({
      name: '달걀', qty: '10개', category: '기타', expires_at: '2030-07-10',
    });
    expect(res.status).toBe(200);
    expect(res.body.saved).toHaveLength(1);
    expect(res.body.saved[0].name).toBe('달걀');
    expect(res.body.saved[0].qty).toBe('10개');
    expect(res.body.count).toBe(1);
  });

  it('each saved item has a unique uuid id', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({ name: '오이', qty: '2개', category: '채소' });
    expect(res.body.saved[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('saves batch items via items array', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({
      items: [
        { name: '당근', qty: '3개', category: '채소' },
        { name: '양파', qty: '2개', category: '채소' },
        { name: '마늘', qty: '1통', category: '채소' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.saved.map(i => i.name)).toEqual(['당근', '양파', '마늘']);
  });

  it('400 when name is missing', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({ qty: '1개', category: '기타' });
    expect(res.status).toBe(400);
  });

  it('defaults qty to "1개" when omitted', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({ name: '버터', category: '유제품' });
    expect(res.status).toBe(200);
    expect(res.body.saved[0].qty).toBe('1개');
  });

  it('defaults category to "기타" when omitted', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({ name: '기타재료', qty: '1개' });
    expect(res.status).toBe(200);
    expect(res.body.saved[0].category).toBe('기타');
  });

  it.each([
    ['육류',     3],
    ['생선',     2],
    ['해산물',   2],
    ['채소',     5],
    ['과일',     5],
    ['유제품',   7],
    ['곡물·기타', 30],
    ['기타',     7],
  ])('기본 유통기한: %s → +%d일', async (category, days) => {
    const auth = await authedUser();
    const before = Date.now();
    const res = await request(app).post('/api/fridge').set(auth).send({ name: `테스트_${category}`, qty: '1개', category });
    const after  = Date.now();
    expect(res.status).toBe(200);
    const expires = new Date(res.body.saved[0].expires_at + 'T23:59:59').getTime();
    const minExpected = before + (days - 1) * 86_400_000;
    const maxExpected = after  + (days + 1) * 86_400_000;
    expect(expires).toBeGreaterThan(minExpected);
    expect(expires).toBeLessThan(maxExpected);
  });

  it('explicit expires_at overrides category default', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({
      name: '특별아이템', qty: '1개', category: '육류', expires_at: '2099-12-31',
    });
    expect(res.body.saved[0].expires_at).toBe('2099-12-31');
  });

  it('skips batch items with blank name', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({
      items: [{ name: '토마토', qty: '5개', category: '채소' }, { name: '  ', qty: '1개' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.saved[0].name).toBe('토마토');
  });

  it('saved item appears in subsequent GET', async () => {
    const auth = await authedUser();
    await request(app).post('/api/fridge').set(auth).send({ name: '두부_get확인', qty: '1모', category: '기타' });
    const res = await request(app).get('/api/fridge').set(auth);
    expect(res.body.items.some(i => i.name === '두부_get확인')).toBe(true);
  });
});

// ── POST /api/fridge — scan_receipt (영수증 OCR) ─────────────────────────────

describe('POST /api/fridge — scan_receipt OCR', () => {
  it('503 when GEMINI_API_KEY is not set', async () => {
    const auth = await authedUser();
    const res = await request(app).post('/api/fridge').set(auth).send({
      scan_receipt: true, image_base64: 'aGVsbG8=',
    });
    expect(res.status).toBe(503);
  });

  it('400 when image_base64 is missing', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true });
    expect(res.status).toBe(400);
  });

  it('parses flat Gemini JSON response', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: '{"items":[{"name":"사과","qty":"2개","category":"과일"},{"name":"배","qty":"3개","category":"과일"}]}' }] },
        }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({
      scan_receipt: true, image_base64: 'aGVsbG8=', mime_type: 'image/jpeg',
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ name: '사과', qty: '2개', category: '과일' });
    expect(res.body.items[1]).toMatchObject({ name: '배', qty: '3개', category: '과일' });
  });

  it('filters out thinking parts (thought: true) — 핵심 버그 회귀 방지', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [
              { thought: true, text: '영수증을 분석합니다. 식품을 찾겠습니다...' },
              { text: '{"items":[{"name":"소고기","qty":"551g","category":"육류"}]}' },
            ],
          },
        }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({
      scan_receipt: true, image_base64: 'aGVsbG8=',
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: '소고기', qty: '551g', category: '육류' });
  });

  it('thinking part only (no output part) → empty items (not crash)', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ thought: true, text: '생각만 하고 출력 없음' }] },
        }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({
      scan_receipt: true, image_base64: 'aGVsbG8=',
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('parses JSON wrapped in ```json code block', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: '```json\n{"items":[{"name":"오이","qty":"2개","category":"채소"}]}\n```' }] },
        }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('오이');
  });

  it('parses raw array format [{"name":...}]', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: '[{"name":"파프리카","qty":"2개","category":"채소"}]' }] },
        }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('파프리카');
  });

  it('returns empty items when Gemini returns {"items":[]}', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items":[]}' }] } }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('502 when Gemini API returns non-ok status', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.status).toBe(502);
  });

  it('assigns default expires_at to each scanned item based on category', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items":[{"name":"닭가슴살","qty":"200g","category":"육류"}]}' }] } }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    const { expires_at } = res.body.items[0];
    expect(expires_at).toBeTruthy();
    expect(new Date(expires_at) > new Date()).toBe(true);
  });

  it('falls back to "1개" when qty is missing in Gemini response', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items":[{"name":"간장","category":"곡물·기타"}]}' }] } }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.body.items[0].qty).toBe('1개');
  });

  it('scan_receipt does NOT save items to DB (preview only)', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items":[{"name":"스캔전용아이템","qty":"1개","category":"기타"}]}' }] } }],
      }),
    });
    await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    const listRes = await request(ocrApp).get('/api/fridge').set(auth);
    expect(listRes.body.items.find(i => i.name === '스캔전용아이템')).toBeUndefined();
  });

  it('multiple items recognized from a single receipt', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    const items = Array.from({ length: 10 }, (_, i) => ({
      name: `상품${i + 1}`, qty: `${i + 1}개`, category: '기타',
    }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ items }) }] } }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
  });

  it('trims whitespace from name and qty', async () => {
    const { app: ocrApp } = await setupTestApp({ GEMINI_API_KEY: 'test-key' });
    const auth = await authedUser(ocrApp);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items":[{"name":" 감자 ","qty":" 1kg ","category":"채소"}]}' }] } }],
      }),
    });
    const res = await request(ocrApp).post('/api/fridge').set(auth).send({ scan_receipt: true, image_base64: 'aGVsbG8=' });
    expect(res.body.items[0].name).toBe('감자');
    expect(res.body.items[0].qty).toBe('1kg');
  });
});

// ── PUT /api/fridge ───────────────────────────────────────────────────────────

describe('PUT /api/fridge', () => {
  it('401 without auth', async () => {
    const res = await request(app).put('/api/fridge').send({ id: 'abc', qty: '1개' });
    expect(res.status).toBe(401);
  });

  it('400 when id is missing', async () => {
    const auth = await authedUser();
    const res = await request(app).put('/api/fridge').set(auth).send({ qty: '2개' });
    expect(res.status).toBe(400);
  });

  it('400 when no updatable fields provided', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '고추', qty: '10개', category: '채소' });
    const { id } = postRes.body.saved[0];
    const res = await request(app).put('/api/fridge').set(auth).send({ id });
    expect(res.status).toBe(400);
  });

  it('404 for unknown id', async () => {
    const auth = await authedUser();
    const res = await request(app).put('/api/fridge').set(auth).send({ id: 'no-such-id', qty: '1개' });
    expect(res.status).toBe(404);
  });

  it('updates qty', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '두유', qty: '1L', category: '유제품' });
    const { id } = postRes.body.saved[0];
    await request(app).put('/api/fridge').set(auth).send({ id, qty: '2L' });
    const listRes = await request(app).get('/api/fridge').set(auth);
    expect(listRes.body.items.find(i => i.id === id).qty).toBe('2L');
  });

  it('updates expires_at', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '치즈', qty: '200g', category: '유제품' });
    const { id } = postRes.body.saved[0];
    await request(app).put('/api/fridge').set(auth).send({ id, expires_at: '2099-01-01' });
    const listRes = await request(app).get('/api/fridge').set(auth);
    expect(listRes.body.items.find(i => i.id === id).expires_at).toBe('2099-01-01');
  });

  it('marks item as consumed → disappears from GET list', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '요거트_소비', qty: '1개', category: '유제품' });
    const { id } = postRes.body.saved[0];
    await request(app).put('/api/fridge').set(auth).send({ id, consumed_at: new Date().toISOString() });
    const listRes = await request(app).get('/api/fridge').set(auth);
    expect(listRes.body.items.find(i => i.id === id)).toBeUndefined();
  });

  it('403 when another user tries to update', async () => {
    const { app: sharedApp } = await setupTestApp();
    const auth1 = await authedUser(sharedApp);
    const auth2 = await authedUser(sharedApp);
    const postRes = await request(sharedApp).post('/api/fridge').set(auth1).send({ name: '내사과', qty: '2개', category: '과일' });
    const { id } = postRes.body.saved[0];
    const res = await request(sharedApp).put('/api/fridge').set(auth2).send({ id, qty: '1개' });
    expect(res.status).toBe(403);
  });

  it('PUT response body is { ok: true }', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '파', qty: '1단', category: '채소' });
    const { id } = postRes.body.saved[0];
    const res = await request(app).put('/api/fridge').set(auth).send({ id, qty: '2단' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── DELETE /api/fridge ────────────────────────────────────────────────────────

describe('DELETE /api/fridge', () => {
  it('401 without auth', async () => {
    const res = await request(app).delete('/api/fridge').send({ id: 'abc' });
    expect(res.status).toBe(401);
  });

  it('400 when id is missing', async () => {
    const auth = await authedUser();
    const res = await request(app).delete('/api/fridge').set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('404 for unknown id', async () => {
    const auth = await authedUser();
    const res = await request(app).delete('/api/fridge').set(auth).send({ id: 'no-such-id' });
    expect(res.status).toBe(404);
  });

  it('deletes item and it disappears from GET', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '버섯_삭제', qty: '100g', category: '채소' });
    const { id } = postRes.body.saved[0];
    const delRes = await request(app).delete('/api/fridge').set(auth).send({ id });
    expect(delRes.status).toBe(200);
    const listRes = await request(app).get('/api/fridge').set(auth);
    expect(listRes.body.items.find(i => i.id === id)).toBeUndefined();
  });

  it('DELETE response body is { ok: true }', async () => {
    const auth = await authedUser();
    const postRes = await request(app).post('/api/fridge').set(auth).send({ name: '삭제테스트', qty: '1개', category: '기타' });
    const { id } = postRes.body.saved[0];
    const res = await request(app).delete('/api/fridge').set(auth).send({ id });
    expect(res.body.ok).toBe(true);
  });

  it('403 when another user tries to delete', async () => {
    const { app: sharedApp } = await setupTestApp();
    const auth1 = await authedUser(sharedApp);
    const auth2 = await authedUser(sharedApp);
    const postRes = await request(sharedApp).post('/api/fridge').set(auth1).send({ name: '내바나나', qty: '3개', category: '과일' });
    const { id } = postRes.body.saved[0];
    const res = await request(sharedApp).delete('/api/fridge').set(auth2).send({ id });
    expect(res.status).toBe(403);
  });
});

// ── 카테고리별 기본 유통기한 — 순수 로직 단위 테스트 ─────────────────────────

// fridge.js의 defaultExpiresAt 로직을 인라인으로 복사해 단위 테스트
const DEFAULT_EXPIRY_DAYS = {
  '육류': 3, '생선': 2, '해산물': 2,
  '채소': 5, '과일': 5,
  '유제품': 7, '곡물·기타': 30, '기타': 7,
};

function defaultExpiresAt(category) {
  const days = DEFAULT_EXPIRY_DAYS[category] ?? 7;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.toISOString().slice(0, 10);
}

describe('defaultExpiresAt (유통기한 기본값 로직)', () => {
  it.each([
    ['육류',     3],
    ['생선',     2],
    ['해산물',   2],
    ['채소',     5],
    ['과일',     5],
    ['유제품',   7],
    ['곡물·기타', 30],
    ['기타',     7],
  ])('%s → 오늘 +%d일 반환', (category, days) => {
    const result = defaultExpiresAt(category);
    const expected = new Date();
    expected.setDate(expected.getDate() + days);
    expect(result).toBe(expected.toISOString().slice(0, 10));
  });

  it('알 수 없는 카테고리는 "기타"와 동일하게 7일 적용', () => {
    const result = defaultExpiresAt('존재하지않는카테고리');
    const expected = defaultExpiresAt('기타');
    expect(result).toBe(expected);
  });

  it('반환 형식은 YYYY-MM-DD', () => {
    expect(defaultExpiresAt('기타')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('오늘 이후 날짜 반환 (과거가 아님)', () => {
    const result = new Date(defaultExpiresAt('육류'));
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});
