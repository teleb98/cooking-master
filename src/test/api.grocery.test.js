/**
 * API handler tests for /api/grocery
 * NOTE: grocery/generate.js was merged into grocery/index.js as POST handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
  default: {
    sign:   (payload) => `mock.${JSON.stringify(payload)}.sig`,
    verify: (token)   => {
      if (token === 'valid-token') return { userId: 'user-1' };
      throw new Error('invalid');
    },
  },
}));

const supabaseMock = { from: vi.fn() };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

const { default: groceryHandler } = await import('../../api/grocery/index.js');

// ── helpers ───────────────────────────────────────────────────────────────────
function makeReq({ method = 'GET', query = {}, body = {}, token = 'valid-token' } = {}) {
  return { method, query, body, headers: { authorization: `Bearer ${token}` } };
}
function makeRes() {
  const r = { _status: 200, _body: null };
  r.status = (c) => { r._status = c; return r; };
  r.json   = (b) => { r._body  = b; return r; };
  r.end    = ()  => r;
  return r;
}
function chainQuery(data, error = null) {
  const terminal = { data, error };
  const chain = {
    select:      vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    is:          vi.fn().mockReturnThis(),
    gt:          vi.fn().mockReturnThis(),
    gte:         vi.fn().mockReturnThis(),
    lte:         vi.fn().mockReturnThis(),
    not:         vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    single:      vi.fn().mockResolvedValue(terminal),
    then:        (r) => Promise.resolve(terminal).then(r),
  };
  return chain;
}

// ── grocery GET ───────────────────────────────────────────────────────────────
describe('GET /api/grocery', () => {
  it('returns 400 when week_start missing', async () => {
    const res = makeRes();
    await groceryHandler(makeReq({ query: {} }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/week_start/);
  });

  it('returns items for given week', async () => {
    const items = [
      { id: 1, name: '소고기', category: '육류', is_bought: false, week_start: '2025-05-05' },
    ];
    supabaseMock.from.mockImplementation(() => chainQuery(items));
    const res = makeRes();
    await groceryHandler(makeReq({ query: { week_start: '2025-05-05' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.items).toHaveLength(1);
    expect(res._body.items[0].name).toBe('소고기');
  });

  it('returns empty array when no items', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null));
    const res = makeRes();
    await groceryHandler(makeReq({ query: { week_start: '2025-05-05' } }), res);
    expect(res._body.items).toEqual([]);
  });
});

// ── grocery PUT ───────────────────────────────────────────────────────────────
describe('PUT /api/grocery', () => {
  it('returns 400 when id missing', async () => {
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'PUT', body: {} }), res);
    expect(res._status).toBe(400);
  });

  it('toggles is_bought flag', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null));
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'PUT', body: { id: 1, is_bought: true } }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });
});

// ── grocery DELETE ────────────────────────────────────────────────────────────
describe('DELETE /api/grocery', () => {
  it('returns 400 when id missing', async () => {
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'DELETE', body: {} }), res);
    expect(res._status).toBe(400);
  });

  it('deletes item successfully', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null));
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'DELETE', body: { id: 42 } }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });
});

// ── grocery POST — 식단에서 장보기 목록 생성 (구 /api/grocery/generate) ────────
describe('POST /api/grocery — generate from meals', () => {
  it('returns 400 when week_start missing', async () => {
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/week_start/);
  });

  it('returns count:0 when no meals exist this week', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery([]));
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'POST', body: { week_start: '2025-05-05' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.count).toBe(0);
  });

  it('generates grocery items from meals with ingredients', async () => {
    const fakeMeals = [
      { menu_name: '소고기 미역국' },
      { menu_name: '소고기 미역국' },
    ];
    const fakeRecipes = [
      {
        name: '소고기 미역국',
        baby: false,
        ingredients: [
          { name: '소고기', qty: '200g' },
          { name: '미역',   qty: '30g' },
        ],
      },
    ];

    supabaseMock.from.mockImplementation((table) => {
      if (table === 'meal_plans') return chainQuery(fakeMeals);
      if (table === 'recipes')    return chainQuery(fakeRecipes);
      return chainQuery(null); // grocery_items delete + insert
    });

    const res = makeRes();
    await groceryHandler(makeReq({ method: 'POST', body: { week_start: '2025-05-05' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.count).toBeGreaterThan(0);
  });

  it('deduplicates ingredients across repeated menus', async () => {
    // 같은 메뉴가 두 번 나와도 재료는 중복되지 않아야 함
    const fakeMeals = [
      { menu_name: '비빔밥' },
      { menu_name: '비빔밥' },
    ];
    const fakeRecipes = [
      { name: '비빔밥', baby: false, ingredients: [{ name: '쌀', qty: '2컵' }] },
    ];

    supabaseMock.from.mockImplementation((table) => {
      if (table === 'meal_plans') return chainQuery(fakeMeals);
      if (table === 'recipes')    return chainQuery(fakeRecipes);
      return chainQuery(null);
    });

    const res = makeRes();
    await groceryHandler(makeReq({ method: 'POST', body: { week_start: '2025-05-05' } }), res);
    // 쌀 하나만 생성 (2번 등장해도 1개 항목)
    expect(res._body.count).toBe(1);
  });

  it('returns 401 when token is missing', async () => {
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'POST', token: 'bad-token', body: { week_start: '2025-05-05' } }), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for unsupported methods', async () => {
    const res = makeRes();
    await groceryHandler(makeReq({ method: 'PATCH' }), res);
    expect(res._status).toBe(405);
  });
});
