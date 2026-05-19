// AI 사용량 제한 — 소프트 런치 기준
// free:    생성 1회/월, 채팅 5턴/월
// premium: 생성 4회/월, 채팅 30턴/월

export const PLAN_LIMITS = {
  free:    { generate: 1,  chat: 5  },
  premium: { generate: 4,  chat: 30 },
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

function isPremiumActive(profile) {
  if (profile?.plan !== 'premium') return false;
  if (!profile.plan_expires_at) return true;
  return new Date(profile.plan_expires_at) > new Date();
}

/**
 * AI 사용 가능 여부를 확인합니다.
 * 새 달이면 카운터를 자동 초기화합니다.
 *
 * @param {object} supabase  Supabase 클라이언트
 * @param {string} userId
 * @param {'generate'|'chat'} type
 * @returns {{ allowed: boolean, isPremium: boolean, plan: string, used: number, limit: number }}
 */
export async function checkAiLimit(supabase, userId, type) {
  const month = currentMonth();

  const { data: p } = await supabase
    .from('user_profiles')
    .select('plan, plan_expires_at, ai_generate_count, ai_chat_turns, ai_usage_month')
    .eq('user_id', userId)
    .maybeSingle();

  const isPremium = isPremiumActive(p);
  const plan      = isPremium ? 'premium' : 'free';
  const limit     = PLAN_LIMITS[plan][type];

  // 새 달이면 카운터 초기화
  let used = 0;
  if (p?.ai_usage_month === month) {
    used = type === 'generate' ? (p.ai_generate_count ?? 0) : (p.ai_chat_turns ?? 0);
  } else {
    await supabase
      .from('user_profiles')
      .update({ ai_generate_count: 0, ai_chat_turns: 0, ai_usage_month: month, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }

  const allowed = used < limit;
  const reason  = allowed ? null : (isPremium ? 'monthly_limit' : 'upgrade_required');

  return { allowed, isPremium, plan, used, limit, reason };
}

/**
 * AI 호출 성공 후 사용 횟수를 1 증가합니다.
 */
export async function incrementAiUsage(supabase, userId, type) {
  const month = currentMonth();
  const field  = type === 'generate' ? 'ai_generate_count' : 'ai_chat_turns';

  const { data: p } = await supabase
    .from('user_profiles')
    .select('ai_generate_count, ai_chat_turns, ai_usage_month')
    .eq('user_id', userId)
    .maybeSingle();

  const current = p?.ai_usage_month === month
    ? (type === 'generate' ? (p.ai_generate_count ?? 0) : (p.ai_chat_turns ?? 0))
    : 0;

  await supabase
    .from('user_profiles')
    .update({ [field]: current + 1, ai_usage_month: month, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}
