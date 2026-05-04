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
const MEAL_KR = { breakfast: '아침', lunch: '점심', dinner: '저녁' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  const { message, history = [] } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  try {
    // Fetch current 2-week meal plan + profile
    const week1 = getMonday(0);
    const week2 = getMonday(1);
    const weekEnd = addDays(week2, 6);

    const [mealsRes, profileRes, recipesRes] = await Promise.all([
      db.supabase.from('meal_plans').select('*').eq('user_id', userId)
        .gte('plan_date', week1).lte('plan_date', weekEnd).order('plan_date').order('meal_type'),
      db.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
      db.supabase.from('recipes').select('name, kcal, baby, tags').order('name'),
    ]);

    const meals = mealsRes.data ?? [];
    const profile = profileRes.data ?? {};
    const allRecipes = recipesRes.data ?? [];

    // Format meal plan as compact text
    const mealByDate = {};
    for (const m of meals) {
      if (!mealByDate[m.plan_date]) mealByDate[m.plan_date] = {};
      mealByDate[m.plan_date][m.meal_type] = m.menu_name ?? '(비어있음)';
    }

    const dates = Object.keys(mealByDate).sort();
    const planText = dates.map((d, i) => {
      const dow = new Date(d).getDay();
      const dayKr = DAY_KR[dow === 0 ? 6 : dow - 1];
      const slot = mealByDate[d];
      return `${d}(${dayKr}) 아침:${slot.breakfast ?? '-'} 점심:${slot.lunch ?? '-'} 저녁:${slot.dinner ?? '-'}`;
    }).join('\n');

    const recipeList = allRecipes.map(r =>
      `${r.name}(${r.kcal}kcal${r.baby ? ',이유식' : ''})`
    ).join(', ');

    const familyType = profile.family_type ?? 'couple';
    const hasBaby = !!profile.baby_birthday;
    const babyMonths = hasBaby ? Math.floor((Date.now() - new Date(profile.baby_birthday)) / (1000 * 60 * 60 * 24 * 30.44)) : null;

    const systemPrompt = `당신은 한국 가족의 식단 관리를 돕는 AI 어시스턴트 'Cooking Master'입니다.

## 가족 정보
- 가족 유형: ${familyType === 'solo' ? '1인' : familyType === 'couple' ? '2인 부부' : '가족'}
${hasBaby ? `- 아기: ${babyMonths}개월 (${babyMonths < 6 ? '초기' : babyMonths < 9 ? '중기' : babyMonths < 12 ? '후기' : '완료기'} 이유식)` : '- 아기 없음'}
- 장보는 요일: ${['월', '화', '수', '목', '금', '토', '일'][profile.shopping_day ?? 6]}요일

## 현재 2주 식단
${planText || '식단 없음'}

## 사용 가능한 레시피 목록
${recipeList}

## 응답 규칙
1. 식단 변경을 제안할 때는 반드시 위 레시피 목록에서 선택하세요
2. 특정 날짜/끼니 변경 제안 시 아래 JSON 블록을 포함하세요:
\`\`\`json
{"changes": [{"plan_date": "YYYY-MM-DD", "meal_type": "breakfast|lunch|dinner", "menu_name": "레시피명"}]}
\`\`\`
3. 아기 있는 경우 이유식 분기를 자동으로 안내하세요
4. 짧고 친근하게, 한국어로 답하세요`;

    // Build message history for multi-turn
    const apiMessages = [
      ...history.map(h => ({ role: h.from === 'user' ? 'user' : 'assistant', content: h.text })),
      { role: 'user', content: message },
    ];

    // Streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
    });

    let fullText = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text;
        fullText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // Extract change suggestions from JSON block
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/);
    let changes = null;
    if (jsonMatch) {
      try { changes = JSON.parse(jsonMatch[1]).changes; } catch { /* ignore */ }
    }

    res.write(`data: ${JSON.stringify({ done: true, changes })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[ai/chat]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 서비스 오류' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
}
