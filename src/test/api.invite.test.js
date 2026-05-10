/**
 * API handler tests for /api/invite
 * GET  (public)  — 토큰 검증
 * POST (auth)    — 초대 링크 생성
 * PUT  (auth)    — 초대 수락 + 식단 마이그레이션
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

const { default: handler } = await import('../../api/invite/index.js');

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
    in:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    single:      vi.fn().mockResolvedValue(terminal),
    then:        (r) => Promise.resolve(terminal).then(r),
  };
  return chain;
}

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST   = '2020-01-01T00:00:00Z';

// ── GET /api/invite ───────────────────────────────────────────────────────────
describe('GET /api/invite — 토큰 검증', () => {
  it('returns 400 when token param is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/token/i);
  });

  it('returns 404 when token not found in DB', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null, { message: 'not found' }));
    const res = makeRes();
    await handler(makeReq({ query: { token: 'bad-tok' } }), res);
    expect(res._status).toBe(404);
  });

  it('returns 410 already_used when invite was already accepted', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery({
      id: 'inv-1', invited_by: 'user-2',
      accepted_at: '2025-01-01T00:00:00Z',
      expires_at: FUTURE,
      users: { name: '김철수', email: 'cs@test.com' },
    }));
    const res = makeRes();
    await handler(makeReq({ query: { token: 'used-tok' } }), res);
    expect(res._status).toBe(410);
    expect(res._body.error).toBe('already_used');
  });

  it('returns 410 expired when invite has expired', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery({
      id: 'inv-1', invited_by: 'user-2',
      accepted_at: null,
      expires_at: PAST,
      users: { name: '김철수', email: 'cs@test.com' },
    }));
    const res = makeRes();
    await handler(makeReq({ query: { token: 'expired-tok' } }), res);
    expect(res._status).toBe(410);
    expect(res._body.error).toBe('expired');
  });

  it('returns 200 with inviter info for a valid token', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery({
      id: 'inv-1', invited_by: 'user-2',
      accepted_at: null,
      expires_at: FUTURE,
      users: { name: '김철수', email: 'cs@test.com' },
    }));
    const res = makeRes();
    await handler(makeReq({ query: { token: 'valid-tok' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.inviter.name).toBe('김철수');
    expect(res._body.token).toBe('valid-tok');
  });
});

// ── POST /api/invite ──────────────────────────────────────────────────────────
describe('POST /api/invite — 초대 링크 생성', () => {
  it('returns 401 when not authenticated', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', token: 'bad' }), res);
    expect(res._status).toBe(401);
  });

  it('returns existing valid token instead of creating a new one', async () => {
    const existing = { token: 'exist-tok', expires_at: FUTURE };
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'user_profiles') return chainQuery({ family_group_id: 'grp-1' });
      if (table === 'invite_tokens') return chainQuery(existing);  // maybeSingle → found
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res._status).toBe(200);
    expect(res._body.token).toBe('exist-tok');
    expect(res._body.url).toContain('exist-tok');
  });

  it('creates and returns a new invite link (201) when none exists', async () => {
    const newInvite = { token: 'new-tok-abc', expires_at: FUTURE };
    const tableCount = {};
    supabaseMock.from.mockImplementation((table) => {
      tableCount[table] = (tableCount[table] ?? 0) + 1;
      const n = tableCount[table];

      if (table === 'user_profiles') return chainQuery({ family_group_id: 'grp-1' });
      if (table === 'invite_tokens') {
        // 1st call: check existing → null; 2nd call: insert → new token
        return n === 1 ? chainQuery(null) : chainQuery(newInvite);
      }
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res._status).toBe(201);
    expect(res._body.token).toBe('new-tok-abc');
    expect(res._body.url).toContain('new-tok-abc');
  });
});

// ── PUT /api/invite ───────────────────────────────────────────────────────────
describe('PUT /api/invite — 초대 수락', () => {
  it('returns 401 when not authenticated', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', token: 'bad', body: { token: 'tok' } }), res);
    expect(res._status).toBe(401);
  });

  it('returns 400 when token body is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: {} }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/token/i);
  });

  it('returns 404 when invite token not found', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery(null, { message: 'not found' }));
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { token: 'no-such-tok' } }), res);
    expect(res._status).toBe(404);
  });

  it('returns 409 already_used when invite already accepted', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery({
      id: 'inv-1', invited_by: 'user-2',
      accepted_at: '2025-01-01T00:00:00Z',
      expires_at: FUTURE,
      family_group_id: 'grp-1',
    }));
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { token: 'used-tok' } }), res);
    expect(res._status).toBe(409);
    expect(res._body.error).toBe('already_used');
  });

  it('returns 410 expired when invite has expired', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery({
      id: 'inv-1', invited_by: 'user-2',
      accepted_at: null,
      expires_at: PAST,
      family_group_id: 'grp-1',
    }));
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { token: 'exp-tok' } }), res);
    expect(res._status).toBe(410);
    expect(res._body.error).toBe('expired');
  });

  it('returns 400 self_invite when user tries to accept own invite', async () => {
    // invited_by === userId ('user-1')
    supabaseMock.from.mockImplementation(() => chainQuery({
      id: 'inv-1', invited_by: 'user-1',
      accepted_at: null,
      expires_at: FUTURE,
      family_group_id: 'grp-1',
    }));
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { token: 'self-tok' } }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('self_invite');
  });

  it('returns 200 with partner_name and conflict_count:0 on valid accept (no meals)', async () => {
    const tableCount = {};
    supabaseMock.from.mockImplementation((table) => {
      tableCount[table] = (tableCount[table] ?? 0) + 1;
      const n = tableCount[table];

      if (table === 'invite_tokens') {
        if (n === 1) return chainQuery({
          id: 'inv-1', invited_by: 'user-2',
          accepted_at: null, expires_at: FUTURE, family_group_id: 'grp-1',
        });
        return chainQuery(null); // update
      }
      if (table === 'users') {
        // 1st call: acceptor (user-1), 2nd call: inviter (user-2)
        return chainQuery({ name: n === 1 ? '수락자' : '초대자' });
      }
      if (table === 'family_members') return chainQuery(null); // no pending + upsert
      if (table === 'user_profiles')  return chainQuery(null); // upsert x2
      if (table === 'meal_plans')     return chainQuery([]);   // empty meals x2
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { token: 'good-tok' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(res._body.partner_name).toBe('초대자');
    expect(res._body.conflict_count).toBe(0);
    expect(res._body.family_group_id).toBe('grp-1');
  });

  it('correctly counts meal conflicts (inviter wins on same slot)', async () => {
    // inviter has breakfast on 05-05; acceptor also has breakfast on 05-05 → conflict
    const inviterMeals  = [{ id: 'im1', plan_date: '2025-05-05', meal_type: 'breakfast' }];
    const acceptorMeals = [{ id: 'am1', plan_date: '2025-05-05', meal_type: 'breakfast' },
                           { id: 'am2', plan_date: '2025-05-05', meal_type: 'lunch' }];

    const tableCount = {};
    supabaseMock.from.mockImplementation((table) => {
      tableCount[table] = (tableCount[table] ?? 0) + 1;
      const n = tableCount[table];

      if (table === 'invite_tokens') {
        if (n === 1) return chainQuery({
          id: 'inv-1', invited_by: 'user-2',
          accepted_at: null, expires_at: FUTURE, family_group_id: 'grp-1',
        });
        return chainQuery(null);
      }
      if (table === 'users')        return chainQuery({ name: n === 1 ? '수락자' : '초대자' });
      if (table === 'family_members') return chainQuery(null);
      if (table === 'user_profiles')  return chainQuery(null);
      if (table === 'meal_plans') {
        // 1st: inviter meals, 2nd: acceptor meals, 3rd+: delete/update ops
        if (n === 1) return chainQuery(inviterMeals);
        if (n === 2) return chainQuery(acceptorMeals);
        return chainQuery(null);
      }
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { token: 'conflict-tok' } }), res);
    expect(res._status).toBe(200);
    // breakfast slot 충돌 1개
    expect(res._body.conflict_count).toBe(1);
    // 총 tagged: inviter breakfast (kept) + acceptor lunch (kept) = 2개 (acceptor breakfast deleted)
    expect(res._body.ok).toBe(true);
  });
});

// ── 405 ───────────────────────────────────────────────────────────────────────
describe('unsupported methods', () => {
  it('returns 405 for DELETE', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);
    expect(res._status).toBe(405);
  });
});
