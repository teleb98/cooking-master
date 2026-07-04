// AI 사용량 제한
// free:          생성 1회/월,  채팅 5턴/월
// premium:       생성 4회/월,  채팅 30턴/월
// admin / test:  무제한

import db from './db.js';

export const PLAN_LIMITS = {
  free:    { generate: 1,   chat: 5  },
  premium: { generate: 4,   chat: 30 },
};

// 커스텀 레시피 허용 개수
export const RECIPE_LIMITS = {
  free:    5,
  premium: Infinity,
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

async function ensureProfileRow(userId) {
  const existing = await db.getOne('SELECT user_id FROM user_profiles WHERE user_id = $1', [userId]);
  if (!existing) await db.run('INSERT INTO user_profiles (user_id) VALUES ($1)', [userId]);
}

function isPremiumActive(profile) {
  if (profile?.is_admin || profile?.is_test) return true;
  if (profile?.plan !== 'premium') return false;
  if (!profile.plan_expires_at) return true;
  return new Date(profile.plan_expires_at) > new Date();
}

export function getPlanType(profile) {
  if (profile?.is_admin) return 'admin';
  if (profile?.is_test)  return 'test';
  return isPremiumActive(profile) ? 'premium' : 'free';
}

/**
 * AI 사용 가능 여부 확인. 새 달이면 카운터 자동 초기화.
 */
export async function checkAiLimit(userId, type) {
  const month = currentMonth();

  await ensureProfileRow(userId);
  const p = await db.getOne(
    'SELECT plan, plan_expires_at, ai_generate_count, ai_chat_turns, ai_usage_month, is_admin, is_test FROM user_profiles WHERE user_id = $1',
    [userId],
  );

  // 관리자 / 테스트 계정 → 무제한
  if (p?.is_admin || p?.is_test) {
    return { allowed: true, isPremium: true, plan: p.is_admin ? 'admin' : 'test', used: 0, limit: 9999, reason: null };
  }

  const isPremium = isPremiumActive(p);
  const plan      = isPremium ? 'premium' : 'free';
  const limit     = PLAN_LIMITS[plan][type];

  let used = 0;
  if (p?.ai_usage_month === month) {
    used = type === 'generate' ? (p.ai_generate_count ?? 0) : (p.ai_chat_turns ?? 0);
  } else {
    await db.run(
      'UPDATE user_profiles SET ai_generate_count = 0, ai_chat_turns = 0, ai_usage_month = $1, updated_at = $2 WHERE user_id = $3',
      [month, new Date().toISOString(), userId],
    );
  }

  const allowed = used < limit;
  const reason  = allowed ? null : (isPremium ? 'monthly_limit' : 'upgrade_required');

  return { allowed, isPremium, plan, used, limit, reason };
}

/**
 * AI 호출 성공 후 사용 횟수 1 증가. 관리자/테스트는 카운트 생략.
 */
export async function incrementAiUsage(userId, type) {
  const month = currentMonth();

  await ensureProfileRow(userId);
  const p = await db.getOne(
    'SELECT ai_generate_count, ai_chat_turns, ai_usage_month, is_admin, is_test FROM user_profiles WHERE user_id = $1',
    [userId],
  );

  if (p?.is_admin || p?.is_test) return;

  const field   = type === 'generate' ? 'ai_generate_count' : 'ai_chat_turns';
  const current = p?.ai_usage_month === month
    ? (type === 'generate' ? (p.ai_generate_count ?? 0) : (p.ai_chat_turns ?? 0))
    : 0;

  await db.run(
    `UPDATE user_profiles SET ${field} = $1, ai_usage_month = $2, updated_at = $3 WHERE user_id = $4`,
    [current + 1, month, new Date().toISOString(), userId],
  );
}
