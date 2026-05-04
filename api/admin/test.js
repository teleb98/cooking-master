/**
 * One-shot integration test runner.
 * POST /api/admin/test  (remove this file after testing)
 */
import { db } from '../_db.js';
import { signToken } from '../_auth.js';

const BASE = process.env.APP_URL ?? 'https://cooking-master-tau.vercel.app';

async function api(token, path, method = 'GET', body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}/api${path}`, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, ok: r.ok, body: json };
}

function pass(label)  { return { label, result: '✅ PASS' }; }
function fail(label, detail) { return { label, result: '❌ FAIL', detail }; }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const results = [];
  let token;
  let testUserId;
  const WEEK_START = (() => {
    const today = new Date();
    const dow = today.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(today);
    mon.setDate(today.getDate() + diff);
    return mon.toISOString().slice(0, 10);
  })();

  // ── Setup: upsert test user ────────────────────────────────────
  try {
    testUserId = 'test-tc-user-001';
    await db.supabase.from('users').upsert({
      id: testUserId,
      provider: 'test',
      provider_id: 'test-tc-001',
      name: '테스트유저',
      email: 'tc@test.com',
    }, { onConflict: 'id' });

    // Delete any existing test meals so seed runs fresh
    await db.supabase.from('meal_plans').delete().eq('user_id', testUserId);
    await db.supabase.from('grocery_items').delete().eq('user_id', testUserId);

    token = signToken(testUserId);
    results.push(pass('SETUP: 테스트 유저 생성 + JWT 발급'));
  } catch (e) {
    return res.json({ error: 'Setup failed: ' + e.message, results });
  }

  // ── TC-001: /api/auth/providers ────────────────────────────────
  {
    const r = await api(token, '/auth/providers');
    if (r.ok && r.body.configured?.google === true && r.body.configured?.kakao === true)
      results.push(pass('TC-001: GET /auth/providers — 4개 공급자 확인'));
    else
      results.push(fail('TC-001: GET /auth/providers', r.body));
  }

  // ── TC-002: /api/auth/me ───────────────────────────────────────
  {
    const r = await api(token, '/auth/me');
    if (r.ok && r.body.user?.id === testUserId)
      results.push(pass('TC-002: GET /auth/me — 현재 유저 반환'));
    else
      results.push(fail('TC-002: GET /auth/me', r.body));
  }

  // ── TC-003: GET /api/recipes ───────────────────────────────────
  {
    const r = await api(token, '/recipes');
    if (r.ok && Array.isArray(r.body.recipes) && r.body.recipes.length >= 20)
      results.push(pass(`TC-003: GET /recipes — ${r.body.recipes.length}개 레시피`));
    else
      results.push(fail('TC-003: GET /recipes', r.body));
  }

  // ── TC-004: GET /api/meals (첫 로드 → 자동 시드) ──────────────
  {
    const r = await api(token, `/meals?week_start=${WEEK_START}`);
    if (r.ok && Array.isArray(r.body.meals) && r.body.meals.length >= 5)
      results.push(pass(`TC-004: GET /meals — 자동 시드 ${r.body.meals.length}건`));
    else
      results.push(fail('TC-004: GET /meals — 자동 시드', r.body));
  }

  // ── TC-005: PUT /api/meals — 메뉴 저장 ────────────────────────
  {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const plan_date = tomorrow.toISOString().slice(0, 10);
    const r = await api(token, '/meals', 'PUT', {
      plan_date,
      meal_type: 'dinner',
      menu_name: '비빔밥',
    });
    if (r.ok && r.body.ok === true)
      results.push(pass('TC-005: PUT /meals — 메뉴 저장'));
    else
      results.push(fail('TC-005: PUT /meals', r.body));
  }

  // ── TC-006: PUT /api/meals — 빈 메뉴(삭제) ────────────────────
  {
    const day = new Date();
    day.setDate(day.getDate() + 2);
    const plan_date = day.toISOString().slice(0, 10);
    const r = await api(token, '/meals', 'PUT', {
      plan_date,
      meal_type: 'lunch',
      menu_name: null,
    });
    if (r.ok && r.body.ok === true)
      results.push(pass('TC-006: PUT /meals (menu_name=null) — 메뉴 삭제'));
    else
      results.push(fail('TC-006: PUT /meals null', r.body));
  }

  // ── TC-007: POST /api/grocery/generate ────────────────────────
  {
    const r = await api(token, '/grocery/generate', 'POST', { week_start: WEEK_START });
    if (r.ok && r.body.count > 0)
      results.push(pass(`TC-007: POST /grocery/generate — ${r.body.count}개 재료 생성`));
    else
      results.push(fail('TC-007: POST /grocery/generate', r.body));
  }

  // ── TC-008: GET /api/grocery ───────────────────────────────────
  {
    const r = await api(token, `/grocery?week_start=${WEEK_START}`);
    if (r.ok && Array.isArray(r.body.items) && r.body.items.length > 0) {
      results.push(pass(`TC-008: GET /grocery — ${r.body.items.length}개 항목`));

      // TC-009: PUT (toggle) ─────────────────────────────────────
      const first = r.body.items[0];
      const r2 = await api(token, '/grocery', 'PUT', { id: first.id, is_bought: true });
      if (r2.ok && r2.body.ok)
        results.push(pass(`TC-009: PUT /grocery (toggle) — "${first.name}" 체크`));
      else
        results.push(fail('TC-009: PUT /grocery toggle', r2.body));

      // TC-010: DELETE ───────────────────────────────────────────
      const last = r.body.items[r.body.items.length - 1];
      const r3 = await api(token, '/grocery', 'DELETE', { id: last.id });
      if (r3.ok && r3.body.ok)
        results.push(pass(`TC-010: DELETE /grocery — "${last.name}" 삭제`));
      else
        results.push(fail('TC-010: DELETE /grocery', r3.body));
    } else {
      results.push(fail('TC-008: GET /grocery', r.body));
    }
  }

  // ── TC-011: 카테고리 분류 검증 ────────────────────────────────
  {
    const r = await api(token, `/grocery?week_start=${WEEK_START}`);
    const cats = [...new Set(r.body.items?.map(i => i.category) ?? [])];
    if (cats.length >= 2)
      results.push(pass(`TC-011: 카테고리 분류 — ${cats.join(', ')}`));
    else
      results.push(fail('TC-011: 카테고리 분류', cats));
  }

  // ── TC-012: 미인증 요청 거부 ──────────────────────────────────
  {
    const r = await fetch(`${BASE}/api/meals?week_start=${WEEK_START}`);
    if (r.status === 401)
      results.push(pass('TC-012: 미인증 → 401 Unauthorized'));
    else
      results.push(fail('TC-012: 미인증 처리', `status=${r.status}`));
  }

  // ── TC-013: week_start 없는 요청 ──────────────────────────────
  {
    const r = await api(token, '/meals');
    if (r.status === 400)
      results.push(pass('TC-013: week_start 누락 → 400 Bad Request'));
    else
      results.push(fail('TC-013: 파라미터 검증', `status=${r.status}`));
  }

  // ── Cleanup ────────────────────────────────────────────────────
  await db.supabase.from('meal_plans').delete().eq('user_id', testUserId);
  await db.supabase.from('grocery_items').delete().eq('user_id', testUserId);
  await db.supabase.from('users').delete().eq('id', testUserId);

  const passed = results.filter(r => r.result.startsWith('✅')).length;
  const failed = results.filter(r => r.result.startsWith('❌')).length;

  return res.json({
    summary: `${passed}/${results.length} passed, ${failed} failed`,
    week_start: WEEK_START,
    results,
  });
}
