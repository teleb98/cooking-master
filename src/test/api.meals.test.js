/**
 * API handler tests for /api/meals
 * Tests the pure logic of the handler by mocking Supabase and JWT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// jwt.verify mock
vi.mock('jsonwebtoken', () => ({
  default: {
    sign:   (payload) => `mock.${JSON.stringify(payload)}.sig`,
    verify: (token)   => {
      if (token === 'valid-token') return { userId: 'user-1' };
      throw new Error('invalid');
    },
  },
}));

// Supabase mock — populated per test
const supabaseMock = {
  from: vi.fn(),
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

// Import handler AFTER mocks are established
const { default: handler } = await import('../../api/meals/index.js');

// ── Helper ───────────────────────────────────────────────────────────────────

function makeReq({ method = 'GET', query = {}, body = {}, token = 'valid-token' } = {}) {
  return {
    method,
    query,
    body,
    headers: { authorization: `Bearer ${token}` },
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body  = body; return this; },
    end()        { return this; },
  };
  return res;
}

function chainQuery(data, error = null) {
  // Builds a chainable Supabase query mock that returns { data, error } at any terminal
  const terminal = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    lte:    vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    single:      vi.fn().mockResolvedValue(terminal),
    // Promise resolution for non-single calls
    then:   (resolve) => Promise.resolve(terminal).then(resolve),
    catch:  (reject)  => Promise.resolve(terminal).catch(reject),
  };
  // Make it awaitable
  chain[Symbol.asyncIterator] = undefined;
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'SupabaseQuery' });
  return chain;
}

// ── Tests: auth ───────────────────────────────────────────────────────────────
describe('GET /api/meals — auth', () => {
  it('rejects missing token with 401', async () => {
    const req = makeReq({ token: '' });
    req.headers = {};
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('rejects invalid token with 401', async () => {
    const req = makeReq({ token: 'bad-token' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});

// ── Tests: GET ────────────────────────────────────────────────────────────────
describe('GET /api/meals', () => {
  it('returns 400 when week_start is missing', async () => {
    const req = makeReq({ method: 'GET', query: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/week_start/i);
  });

  it('returns meals for the given week', async () => {
    const fakeMeals = [
      { id: 1, plan_date: '2025-05-05', meal_type: 'breakfast', menu_name: '오트밀 죽', user_id: 'user-1' },
    ];
    const existingCheck = chainQuery([{ id: 1 }]);
    const mealsQuery = chainQuery(fakeMeals);

    let callIndex = 0;
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'meal_plans') {
        callIndex++;
        // First call: existing check; second call: actual fetch
        return callIndex === 1 ? existingCheck : mealsQuery;
      }
      return chainQuery([]);
    });

    const req = makeReq({ method: 'GET', query: { week_start: '2025-05-05' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty('meals');
  });
});

// ── Tests: PUT ────────────────────────────────────────────────────────────────
describe('PUT /api/meals', () => {
  it('returns 400 when plan_date is missing', async () => {
    const req = makeReq({ method: 'PUT', body: { meal_type: 'breakfast' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when meal_type is missing', async () => {
    const req = makeReq({ method: 'PUT', body: { plan_date: '2025-05-05' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('updates a meal slot successfully', async () => {
    const recipeQuery = chainQuery({ kcal: 380, baby: false });
    const upsertQuery = chainQuery({ id: 1 });

    supabaseMock.from.mockImplementation((table) => {
      if (table === 'recipes') return recipeQuery;
      if (table === 'meal_plans') return upsertQuery;
      return chainQuery(null);
    });

    const req = makeReq({
      method: 'PUT',
      body: { plan_date: '2025-05-05', meal_type: 'breakfast', menu_name: '닭가슴살 샐러드' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it('clears a meal slot when menu_name is null', async () => {
    const upsertQuery = chainQuery({ id: 1 });
    supabaseMock.from.mockImplementation(() => upsertQuery);

    const req = makeReq({
      method: 'PUT',
      body: { plan_date: '2025-05-05', meal_type: 'breakfast', menu_name: null },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});

// ── Tests: unsupported methods ─────────────────────────────────────────────────
describe('unsupported methods', () => {
  it('returns 405 for DELETE', async () => {
    const req = makeReq({ method: 'DELETE', body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
