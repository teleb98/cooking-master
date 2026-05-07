/**
 * API handler tests for /api/user/profile (GET, PUT, DELETE)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

const { default: handler } = await import('../../api/user/profile.js');

function makeReq({ method = 'GET', body = {}, token = 'valid-token' } = {}) {
  return { method, body, headers: { authorization: `Bearer ${token}` } };
}
function makeRes() {
  const r = { _status: 200, _body: null };
  r.status = (c) => { r._status = c; return r; };
  r.json   = (b) => { r._body = b; return r; };
  r.end    = () => r;
  return r;
}
function chainQuery(data, error = null) {
  const terminal = { data, error };
  const chain = {
    select:  vi.fn().mockReturnThis(),
    insert:  vi.fn().mockReturnThis(),
    upsert:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    delete:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    single:      vi.fn().mockResolvedValue(terminal),
    then: (r) => Promise.resolve(terminal).then(r),
  };
  return chain;
}

// ── GET ───────────────────────────────────────────────────────────────────────
describe('GET /api/user/profile', () => {
  it('returns 401 for no token', async () => {
    const req = makeReq({ token: 'bad' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('returns user + profile data', async () => {
    const fakeUser    = { id: 'user-1', name: '테스트', email: 't@t.com', provider: 'google', avatar_url: null, created_at: new Date(), last_login_at: new Date() };
    const fakeProfile = { user_id: 'user-1', family_type: 'couple', shopping_day: 6, food_likes: ['소고기'], allergies: [] };

    supabaseMock.from.mockImplementation((table) => {
      if (table === 'users')         return chainQuery(fakeUser);
      if (table === 'user_profiles') return chainQuery(fakeProfile);
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.user.id).toBe('user-1');
    expect(res._body.profile.family_type).toBe('couple');
  });

  it('returns 401 when user row not found', async () => {
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'users')         return chainQuery(null);
      if (table === 'user_profiles') return chainQuery(null);
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(401);
  });
});

// ── PUT ───────────────────────────────────────────────────────────────────────
describe('PUT /api/user/profile', () => {
  it('saves profile with defaults when body is empty', async () => {
    const savedProfile = { user_id: 'user-1', family_type: 'couple', shopping_day: 6, food_likes: [], allergies: [] };
    supabaseMock.from.mockImplementation(() => chainQuery(savedProfile));

    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: {} }), res);
    expect(res._status).toBe(200);
    expect(res._body.profile.family_type).toBe('couple');
  });

  it('saves food_likes and allergies arrays', async () => {
    const body = { family_type: 'family', food_likes: ['소고기', '닭고기'], allergies: ['달걀'], shopping_day: 6 };
    const saved = { ...body, user_id: 'user-1' };
    supabaseMock.from.mockImplementation(() => chainQuery(saved));

    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body }), res);
    expect(res._status).toBe(200);
    expect(res._body.profile.food_likes).toEqual(['소고기', '닭고기']);
    expect(res._body.profile.allergies).toEqual(['달걀']);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
describe('DELETE /api/user/profile', () => {
  it('deletes all user data and returns ok', async () => {
    const deleteMock = chainQuery(null);
    supabaseMock.from.mockImplementation(() => deleteMock);

    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
    // Verify from() was called for all tables
    expect(supabaseMock.from).toHaveBeenCalledWith('meal_plans');
    expect(supabaseMock.from).toHaveBeenCalledWith('grocery_items');
    expect(supabaseMock.from).toHaveBeenCalledWith('user_profiles');
    expect(supabaseMock.from).toHaveBeenCalledWith('users');
  });
});

// ── 405 ───────────────────────────────────────────────────────────────────────
describe('unsupported methods', () => {
  it('returns 405 for PATCH', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PATCH' }), res);
    expect(res._status).toBe(405);
  });
});
