import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const { default: handler } = await import('../../api/recipes/index.js');

function makeReq({ method = 'GET', body = {}, token = 'valid-token', query = {} } = {}) {
  return { method, body, headers: { authorization: `Bearer ${token}` }, query };
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
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    or:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    single:      vi.fn().mockResolvedValue(terminal),
    then: (r) => Promise.resolve(terminal).then(r),
  };
  return chain;
}

// ── 인증 ──────────────────────────────────────────────────────────────────────
describe('인증', () => {
  it('GET: 토큰 없으면 401', async () => {
    const res = makeRes();
    await handler(makeReq({ token: 'bad' }), res);
    expect(res._status).toBe(401);
  });

  it('POST: 토큰 없으면 401', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', token: 'bad', body: { name: '테스트' } }), res);
    expect(res._status).toBe(401);
  });

  it('DELETE: 토큰 없으면 401', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', token: 'bad', body: { name: '테스트' } }), res);
    expect(res._status).toBe(401);
  });
});

// ── GET 목록 ──────────────────────────────────────────────────────────────────
describe('GET /api/recipes (목록)', () => {
  it('공유 레시피 + 내 커스텀 레시피 반환', async () => {
    const recipes = [
      { name: '김치찌개', kcal: 450, baby: false, user_id: null },
      { name: '나만의 레시피', kcal: 300, baby: false, user_id: 'user-1' },
    ];
    supabaseMock.from.mockImplementation(() => chainQuery(recipes));
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.recipes).toHaveLength(2);
  });

  it('user_id 필터 쿼리에 .or() 호출됨', async () => {
    const chain = chainQuery([]);
    supabaseMock.from.mockImplementation(() => chain);
    await handler(makeReq(), makeRes());
    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('user_id.is.null'));
    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('user-1'));
  });

  it('컬럼 에러 시 fallback 쿼리로 빈 배열이 아닌 레시피 반환', async () => {
    const recipes = [{ name: '김치찌개', kcal: 450, baby: false }];
    let callCount = 0;
    supabaseMock.from.mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? chainQuery(null, new Error('column not found'))
        : chainQuery(recipes);
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.recipes).toHaveLength(1);
  });

  it('빈 레시피 DB → 빈 배열 반환', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery([]));
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.recipes).toEqual([]);
  });
});

// ── GET 상세 ──────────────────────────────────────────────────────────────────
describe('GET /api/recipes?name=xxx (상세)', () => {
  it('레시피 상세 반환', async () => {
    const recipe = {
      name: '김치찌개', kcal: 450, baby: false, tags: [], ingredients: [],
      steps: ['1단계', '2단계'], user_id: null,
    };
    supabaseMock.from.mockImplementation(() => chainQuery(recipe));
    const res = makeRes();
    await handler(makeReq({ query: { name: '김치찌개' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.recipe.name).toBe('김치찌개');
    expect(res._body.recipe.steps).toHaveLength(2);
  });

  it('없는 레시피이면 recipe: null 반환', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null));
    const res = makeRes();
    await handler(makeReq({ query: { name: '없는메뉴' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.recipe).toBeNull();
  });

  it('내 커스텀 레시피 상세에 user_id 포함', async () => {
    const recipe = { name: '나만의 국', kcal: 200, user_id: 'user-1', tags: [], ingredients: [], steps: [] };
    supabaseMock.from.mockImplementation(() => chainQuery(recipe));
    const res = makeRes();
    await handler(makeReq({ query: { name: '나만의 국' } }), res);
    expect(res._body.recipe.user_id).toBe('user-1');
  });
});

// ── POST 커스텀 레시피 생성 ───────────────────────────────────────────────────
describe('POST /api/recipes (커스텀 레시피 생성)', () => {
  it('새 레시피 생성 — user_id 포함해서 insert', async () => {
    const created = { name: '나만의 국', kcal: 200, tags: [], ingredients: [], baby: false, user_id: 'user-1' };
    supabaseMock.from.mockImplementation(() => chainQuery(created));
    const res = makeRes();
    await handler(makeReq({
      method: 'POST',
      body: { name: '나만의 국', kcal: '200', tags: [], ingredients: [], create: true },
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.recipe.user_id).toBe('user-1');
    expect(res._body.recipe.name).toBe('나만의 국');
  });

  it('name 없으면 400', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { create: true } }), res);
    expect(res._status).toBe(400);
  });

  it('중복 이름(23505) → 409 반환', async () => {
    const dupErr = Object.assign(new Error('unique violation'), { code: '23505' });
    supabaseMock.from.mockImplementation(() => chainQuery(null, dupErr));
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { name: '기존 레시피', create: true } }), res);
    expect(res._status).toBe(409);
  });

  it('kcal 문자열이 숫자로 변환됨', async () => {
    const insertMock = vi.fn().mockReturnThis();
    const chain = chainQuery({ name: '새레시피', kcal: 300, user_id: 'user-1' });
    chain.insert = insertMock;
    supabaseMock.from.mockReturnValue(chain);
    await handler(makeReq({ method: 'POST', body: { name: '새레시피', kcal: '300', create: true } }), makeRes());
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ kcal: 300 }));
  });
});

// ── POST AI 조리법 생성 ───────────────────────────────────────────────────────
describe('POST /api/recipes (AI 조리법 생성)', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; });
  afterEach(() => { delete process.env.GEMINI_API_KEY; });

  it('이미 steps 있으면 AI 호출 없이 반환', async () => {
    const recipe = { name: '김치찌개', kcal: 450, steps: ['1단계', '2단계'], ingredients: [] };
    supabaseMock.from.mockImplementation(() => chainQuery(recipe));
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { name: '김치찌개' } }), res);
    expect(res._status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res._body.recipe.steps).toHaveLength(2);
  });

  it('steps 없으면 Gemini 호출 후 조리법 포함해서 반환', async () => {
    const recipe = { name: '된장찌개', kcal: 380, steps: null, ingredients: [{ name: '된장', qty: '2T' }] };
    supabaseMock.from.mockImplementation(() => chainQuery(recipe));
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          prep_time: 5, cook_time: 15, serving: 2,
          steps: ['1단계', '2단계', '3단계'],
          tips: '맛있게 끓이는 팁',
          nutrition: { protein_g: 10, carb_g: 20, fat_g: 5, fiber_g: 2 },
        }) }] } }],
      }),
    });
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { name: '된장찌개' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.recipe.steps).toHaveLength(3);
    expect(res._body.recipe.prep_time).toBe(5);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('레시피 찾을 수 없으면 404', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null));
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { name: '없는메뉴' } }), res);
    expect(res._status).toBe(404);
  });

  it('Gemini 429 → 429 반환', async () => {
    const recipe = { name: '비빔밥', kcal: 500, steps: null, ingredients: [] };
    supabaseMock.from.mockImplementation(() => chainQuery(recipe));
    global.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { name: '비빔밥' } }), res);
    expect(res._status).toBe(429);
  });

  it('GEMINI_API_KEY 없으면 500', async () => {
    delete process.env.GEMINI_API_KEY;
    const recipe = { name: '비빔밥', kcal: 500, steps: null, ingredients: [] };
    supabaseMock.from.mockImplementation(() => chainQuery(recipe));
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { name: '비빔밥' } }), res);
    expect(res._status).toBe(500);
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────────
describe('DELETE /api/recipes', () => {
  it('name 없으면 400', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', body: {} }), res);
    expect(res._status).toBe(400);
  });

  it('본인 커스텀 레시피 삭제 성공', async () => {
    const chain = chainQuery(null);
    supabaseMock.from.mockReturnValue(chain);
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', body: { name: '나만의 국' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('name', '나만의 국');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

// ── 405 ───────────────────────────────────────────────────────────────────────
describe('unsupported methods', () => {
  it('PATCH → 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PATCH' }), res);
    expect(res._status).toBe(405);
  });
});
