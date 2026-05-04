import Anthropic from '@anthropic-ai/sdk';
import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getMonday(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY_KR = ['월', '화', '수', '목', '금', '토', '일'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  const { message, history = [] } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  try {
    const week1 = getMonday(0);
    const weekEnd = addDays(getMonday(1), 6);

    const [mealsRes, profileRes, recipesRes] = await Promise.all([
      db.supabase.from('meal_plans').select('*').eq('user_id', userId)
        .gte('plan_date', week1).lte('plan_date', weekEnd).order('plan_date').order('meal_type'),
      db.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
      db.supabase.from('recipes').select('name, kcal, baby, tags').order('name'),
    ]);

    const meals = mealsRes.data ?? [];
    const profile = profileRes.data ?? {};
    const allRecipes = recipesRes.data ?? [];

    // 식단 → 텍스트 요약
    const mealByDate = {};
    for (const m of meals) {
      if (!mealByDate[m.plan_date]) mealByDate[m.plan_date] = {};
      mealByDate[m.plan_date][m.meal_type] = m.menu_name ?? '(비어있음)';
    }
    const planText = Object.keys(mealByDate).sort().map(d => {
      const dow = new Date(d).getDay();
      const dayKr = DAY_KR[dow === 0 ? 6 : dow - 1];
      const s = mealByDate[d];
      return `${d}(${dayKr}) 아침:${s.breakfast ?? '-'} 점심:${s.lunch ?? '-'} 저녁:${s.dinner ?? '-'}`;
    }).join('\n');

    const recipeList = allRecipes.map(r =>
      `${r.name}(${r.kcal}kcal${r.baby ? ',이유식' : ''})`
    ).join(', ');

    const hasBaby = !!profile.baby_birthday;
    const babyMonths = hasBaby
      ? Math.floor((Date.now() - new Date(profile.baby_birthday)) / (1000 * 60 * 60 * 24 * 30.44))
      : null;
    const familyType = profile.family_type ?? 'couple';

    const systemPrompt = `당신은 한국 가족의 식단 관리를 돕는 AI 어시스턴트 'Cooking Master'입니다.

## 가족 정보
- 가족 유형: ${familyType === 'solo' ? '1인' : familyType === 'couple' ? '2인 부부' : '가족'}
${hasBaby ? `- 아기: ${babyMonths}개월 (${babyMonths < 6 ? '초기' : babyMonths < 9 ? '중기' : babyMonths < 12 ? '후기' : '완료기'} 이유식)` : '- 아기 없음'}
- 장보는 요일: ${['월', '화', '수', '목', '금', '토', '일'][profile.shopping_day ?? 6]}요일

## 현재 2주 식단
${planText || '식단 없음'}

## 사용 가능한 레시피
${recipeList}

## 응답 규칙
1. 식단 변경 제안 시 반드시 위 레시피 목록에서 선택
2. 특정 날짜/끼니 변경 제안 시 응답 마지막에 JSON 블록 포함:
\`\`\`json
{"changes":[{"plan_date":"YYYY-MM-DD","meal_type":"breakfast|lunch|dinner","menu_name":"레시피명"}]}
\`\`\`
3. 아기가 있으면 이유식 분기 자동 안내
4. 친근하고 간결하게, 한국어로 답변`;

    const apiMessages = [
      ...history.slice(-8).map(h => ({ role: h.from === 'user' ? 'user' : 'assistant', content: h.text })),
      { role: 'user', content: message },
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
    });

    const text = response.content[0]?.text ?? '';

    // JSON 변경 블록 파싱
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    let changes = null;
    if (jsonMatch) {
      try { changes = JSON.parse(jsonMatch[1]).changes ?? null; } catch { /* ignore */ }
    }

    // 표시용 텍스트 (JSON 블록 제거)
    const displayText = text.replace(/```json[\s\S]*?```/g, '').trim();

    return res.json({ text: displayText, changes });
  } catch (err) {
    console.error('[ai/chat]', err.message);
    if (err.message?.includes('credit')) {
      return res.status(402).json({ error: 'AI 크레딧이 부족합니다. 관리자에게 문의하세요.' });
    }
    return res.status(500).json({ error: 'AI 응답 중 오류가 발생했습니다.' });
  }
}
