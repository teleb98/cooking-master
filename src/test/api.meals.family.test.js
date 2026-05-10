/**
 * API handler tests for /api/meals — 가족 그룹(공유 식단) 시나리오
 * 연결된 가족 GET/PUT 흐름 전용.
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

const { default: handler } = await import('../../api/meals/index.js');

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
    gte:         vi.fn().mockReturnThis(),
    lte:         vi.fn().mockReturnThis(),
    not:         vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    single:      vi.fn().mockResolvedValue(terminal),
    then:        (r) => Promise.resolve(terminal).then(r),
    catch:       (r) => Promise.resolve(terminal).catch(r),
  };
  return chain;
}

// 연결된 가족의 공통 상태 모킹 헬퍼
function mockConnectedFamily({ groupMeals = [], untaggedMeals = [], userHasMeals = true } = {}) {
  const tableCount = {};
  supabaseMock.from.mockImplementation((table) => {
    tableCount[table] = (tableCount[table] ?? 0) + 1;
    const n = tableCount[table];

    if (table === 'user_profiles')  return chainQuery({ family_group_id: 'grp-1' });
    if (table === 'family_members') return chainQuery({ status: 'active' });
    if (table === 'meal_plans') {
      if (n === 1) return chainQuery(userHasMeals ? [{ id: 'seed-check' }] : null); // seed check
      if (n === 2) return chainQuery(groupMeals);    // group meals (Promise.all #1)
      if (n === 3) return chainQuery(untaggedMeals); // untagged (Promise.all #2)
    }
    return chainQuery(null);
  });
}

// ── GET — 연결된 가족 ─────────────────────────────────────────────────────────
describe('GET /api/meals — 연결된 가족', () => {
  it('returns is_connected:true and family_group_id when family is active', async () => {
    mockConnectedFamily({ groupMeals: [], untaggedMeals: [] });

    const res = makeRes();
    await handler(makeReq({ query: { week_start: '2025-05-05' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.is_connected).toBe(true);
    expect(res._body.family_group_id).toBe('grp-1');
  });

  it('returns group meals merged with untagged user meals', async () => {
    const groupMeal = {
      id: 'gm1', plan_date: '2025-05-05', meal_type: 'breakfast',
      menu_name: '오트밀 죽', family_group_id: 'grp-1', user_id: 'user-2',
    };
    const untaggedMeal = {
      id: 'um1', plan_date: '2025-05-06', meal_type: 'lunch',
      menu_name: '비빔밥', family_group_id: null, user_id: 'user-1',
    };
    mockConnectedFamily({ groupMeals: [groupMeal], untaggedMeals: [untaggedMeal] });

    const res = makeRes();
    await handler(makeReq({ query: { week_start: '2025-05-05' } }), res);
    expect(res._body.meals).toHaveLength(2);
    const names = res._body.meals.map(m => m.menu_name);
    expect(names).toContain('오트밀 죽');
    expect(names).toContain('비빔밥');
  });

  it('group meal wins over untagged meal on same slot', async () => {
    // 같은 날 같은 끼니에 group meal과 untagged meal이 겹치면 group meal 우선
    const groupMeal = {
      id: 'gm1', plan_date: '2025-05-05', meal_type: 'breakfast',
      menu_name: '그룹-메뉴', family_group_id: 'grp-1', user_id: 'user-2',
    };
    const untaggedMeal = {
      id: 'um1', plan_date: '2025-05-05', meal_type: 'breakfast',
      menu_name: '개인-메뉴', family_group_id: null, user_id: 'user-1',
    };
    mockConnectedFamily({ groupMeals: [groupMeal], untaggedMeals: [untaggedMeal] });

    const res = makeRes();
    await handler(makeReq({ query: { week_start: '2025-05-05' } }), res);
    // 같은 슬롯 → group meal 우선, 1개 결과
    expect(res._body.meals).toHaveLength(1);
    expect(res._body.meals[0].menu_name).toBe('그룹-메뉴');
  });

  it('seeds family group plan when connected user has no meals yet', async () => {
    // userHasMeals=false → 파트너 식단도 없음 → seed 실행 경로
    const tableCount = {};
    supabaseMock.from.mockImplementation((table) => {
      tableCount[table] = (tableCount[table] ?? 0) + 1;
      const n = tableCount[table];

      if (table === 'user_profiles')  return chainQuery({ family_group_id: 'grp-1' });
      if (table === 'family_members') return chainQuery({ status: 'active' });
      if (table === 'meal_plans') {
        if (n === 1) return chainQuery([]);   // seed check: user has no meals
        if (n === 2) return chainQuery([]);   // group meal check: also empty → seed
        // seed upsert call + subsequent group/untagged queries
        return chainQuery([]);
      }
      if (table === 'recipes') return chainQuery([]); // seed recipe lookup
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({ query: { week_start: '2025-05-05' } }), res);
    // 200 반환 여부 확인 (seed 로직 충돌 없이 완료)
    expect(res._status).toBe(200);
    expect(res._body.is_connected).toBe(true);
  });
});

// ── PUT — 연결된 가족 ─────────────────────────────────────────────────────────
describe('PUT /api/meals — 연결된 가족 공유 식단', () => {
  it('updates existing shared meal slot when one already exists', async () => {
    const tableCount = {};
    supabaseMock.from.mockImplementation((table) => {
      tableCount[table] = (tableCount[table] ?? 0) + 1;
      const n = tableCount[table];

      if (table === 'recipes')        return chainQuery({ kcal: 400, baby: false });
      if (table === 'user_profiles')  return chainQuery({ family_group_id: 'grp-1' });
      if (table === 'family_members') return chainQuery({ status: 'active' });
      if (table === 'meal_plans') {
        // maybeSingle: find existing shared slot
        if (n === 1) return chainQuery({ id: 'existing-meal-id' });
        // update call
        return chainQuery(null);
      }
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({
      method: 'PUT',
      body: { plan_date: '2025-05-05', meal_type: 'lunch', menu_name: '닭가슴살 샐러드' },
    }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it('inserts new shared meal when slot does not exist yet', async () => {
    const tableCount = {};
    supabaseMock.from.mockImplementation((table) => {
      tableCount[table] = (tableCount[table] ?? 0) + 1;
      const n = tableCount[table];

      if (table === 'recipes')        return chainQuery({ kcal: 300, baby: false });
      if (table === 'user_profiles')  return chainQuery({ family_group_id: 'grp-1' });
      if (table === 'family_members') return chainQuery({ status: 'active' });
      if (table === 'meal_plans') {
        if (n === 1) return chainQuery(null); // no existing → insert path
        return chainQuery(null);              // insert
      }
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({
      method: 'PUT',
      body: { plan_date: '2025-05-07', meal_type: 'dinner', menu_name: '갈비찜' },
    }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it('clears a shared meal slot when menu_name is null (메뉴 삭제)', async () => {
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'user_profiles')  return chainQuery({ family_group_id: 'grp-1' });
      if (table === 'family_members') return chainQuery({ status: 'active' });
      if (table === 'meal_plans')     return chainQuery({ id: 'existing-id' });
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({
      method: 'PUT',
      body: { plan_date: '2025-05-05', meal_type: 'breakfast', menu_name: null },
    }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it('falls back to solo upsert when user is not connected (isConnected=false)', async () => {
    // user_profiles에 family_group_id 없음 → solo 경로
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'recipes')       return chainQuery({ kcal: 350, baby: false });
      if (table === 'user_profiles') return chainQuery({ family_group_id: null });
      // family_members 조회 없이 upsert
      return chainQuery(null);
    });

    const res = makeRes();
    await handler(makeReq({
      method: 'PUT',
      body: { plan_date: '2025-05-05', meal_type: 'breakfast', menu_name: '오트밀 죽' },
    }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });
});
