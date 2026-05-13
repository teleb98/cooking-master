import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webpushMod from 'web-push';

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

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

const { default: handler } = await import('../../api/user/profile.js');

function makeReq({ method = 'GET', body = {}, token = 'valid-token', query = {} } = {}) {
  return { method, body, headers: { authorization: `Bearer ${token}` }, query };
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
    select:      vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    not:         vi.fn().mockReturnThis(),
    or:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
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

// ── POST (push subscription) ──────────────────────────────────────────────────
describe('POST /api/user/profile (push subscription)', () => {
  it('saves push_subscription and returns ok', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery({ user_id: 'user-1' }));
    const sub = { endpoint: 'https://fcm.googleapis.com/send/123', keys: { p256dh: 'abc', auth: 'xyz' } };
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { push_subscription: sub } }), res);
    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
  });

  it('returns 401 without valid token', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', token: 'bad', body: { push_subscription: {} } }), res);
    expect(res._status).toBe(401);
  });

  it('calls upsert with push_subscription on user_profiles', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const chain = chainQuery(null);
    chain.upsert = upsertMock;
    supabaseMock.from.mockReturnValue(chain);

    const sub = { endpoint: 'https://push.example.com/1', keys: {} };
    await handler(makeReq({ method: 'POST', body: { push_subscription: sub } }), makeRes());
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', push_subscription: sub }),
      expect.any(Object),
    );
  });
});

// ── GET cron=notify ───────────────────────────────────────────────────────────
describe('GET /api/user/profile?cron=notify', () => {
  beforeEach(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
  afterEach(() => { delete process.env.CRON_SECRET; });

  function cronReq() {
    return { method: 'GET', query: { cron: 'notify' }, headers: { authorization: 'Bearer test-cron-secret' }, body: {} };
  }

  it('returns 401 when authorization is wrong', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { cron: 'notify' }, headers: { authorization: 'Bearer wrong' }, body: {} }, res);
    expect(res._status).toBe(401);
  });

  it('returns 401 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const res = makeRes();
    await handler(cronReq(), res);
    expect(res._status).toBe(401);
  });

  it('sends notifications to all subscribers and returns sent count', async () => {
    const profiles = [
      { user_id: 'u1', push_subscription: { endpoint: 'https://fcm.google.com/1', keys: {} } },
      { user_id: 'u2', push_subscription: { endpoint: 'https://fcm.google.com/2', keys: {} } },
    ];
    supabaseMock.from.mockImplementation(() => chainQuery(profiles));
    webpushMod.sendNotification.mockResolvedValue({});

    const res = makeRes();
    await handler(cronReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.sent).toBe(2);
    expect(res._body.expired).toBe(0);
    expect(webpushMod.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('marks expired subscriptions (410) and clears them from DB', async () => {
    const profiles = [
      { user_id: 'u1', push_subscription: { endpoint: 'https://fcm.google.com/1', keys: {} } },
      { user_id: 'u2', push_subscription: { endpoint: 'https://fcm.google.com/2', keys: {} } },
    ];
    supabaseMock.from.mockImplementation(() => chainQuery(profiles));
    webpushMod.sendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));

    const res = makeRes();
    await handler(cronReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.sent).toBe(0);
    expect(res._body.expired).toBe(2);
    expect(supabaseMock.from).toHaveBeenCalledWith('user_profiles');
  });

  it('returns ok with 0 counts when no subscribers', async () => {
    supabaseMock.from.mockImplementation(() => chainQuery([]));
    const res = makeRes();
    await handler(cronReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.sent).toBe(0);
    expect(res._body.expired).toBe(0);
    expect(webpushMod.sendNotification).not.toHaveBeenCalled();
  });

  it('does not affect normal GET when query.cron is absent', async () => {
    const fakeUser    = { id: 'user-1', name: '테스트', email: 't@t.com', provider: 'google', avatar_url: null, created_at: new Date(), last_login_at: new Date() };
    const fakeProfile = { user_id: 'user-1', family_type: 'solo', shopping_day: 6, food_likes: [], allergies: [] };
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'users')         return chainQuery(fakeUser);
      if (table === 'user_profiles') return chainQuery(fakeProfile);
      return chainQuery(null);
    });
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);
    expect(res._status).toBe(200);
    expect(res._body.user).toBeDefined();
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
