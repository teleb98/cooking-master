import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

// gemini-2.5-flash: latest stable flash model, confirmed working
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });

  try {
    const week1   = getMonday(0);
    const weekEnd = addDays(getMonday(1), 6);

    const [mealsRes, profileRes, recipesRes] = await Promise.all([
      db.supabase.from('meal_plans').select('*').eq('user_id', userId)
        .gte('plan_date', week1).lte('plan_date', weekEnd).order('plan_date').order('meal_type'),
      db.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
      db.supabase.from('recipes').select('name, kcal, baby, tags').order('name'),
    ]);

    const meals      = mealsRes.data ?? [];
    const profile    = profileRes.data ?? {};
    const allRecipes = recipesRes.data ?? [];

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

    const hasBaby    = !!profile.baby_birthday;
    const babyMonths = hasBaby
      ? Math.floor((Date.now() - new Date(profile.baby_birthday)) / (1000 * 60 * 60 * 24 * 30.44))
      : null;
    const familyType = profile.family_type ?? 'couple';
    const foodLikes  = Array.isArray(profile.food_likes) ? profile.food_likes : [];
    const allergies  = Array.isArray(profile.allergies)  ? profile.allergies  : [];

    // 가족 유형별 식단 제안 가이드라인
    const familyGuide = familyType === 'solo'
      ? `1인 사용자입니다.
- 1인분으로 먹기 좋은 소용량 레시피를 우선 추천합니다.
- 식재료 낭비를 줄이는 메뉴 조합을 제안합니다 (예: 오늘 남은 재료를 내일 활용).
- 간편하게 준비할 수 있는 메뉴를 선호합니다.`
      : familyType === 'couple'
      ? `2인 커플입니다.
- 두 사람이 함께 먹기 좋은 2인분 기준 레시피를 추천합니다.
- 다양한 맛과 영양 균형을 고려한 메뉴를 제안합니다.`
      : `아이가 있는 가족입니다.
- 어른과 아이 모두 먹을 수 있는 레시피를 우선 추천합니다.
${hasBaby ? `- 아기(${babyMonths}개월, ${babyMonths < 6 ? '초기' : babyMonths < 9 ? '중기' : babyMonths < 12 ? '후기' : '완료기'} 이유식)에 맞는 이유식 분기를 자동 안내합니다.` : ''}
- 영양 균형과 아이 친화적 식재료를 고려합니다.`;

    const prefSection = (foodLikes.length > 0 || allergies.length > 0)
      ? `\n사용자 취향:\n${foodLikes.length  > 0 ? `- 좋아하는 재료: ${foodLikes.join(', ')}` : ''}${allergies.length > 0 ? `\n- 알레르기·피해야 할 재료: ${allergies.join(', ')} (이 재료가 포함된 메뉴는 절대 추천하지 말 것)` : ''}`
      : '';

    const systemPrompt = `당신은 한국 가족의 식단 관리를 돕는 AI 어시스턴트 'Cooking Master'입니다.

가족 정보:
- 유형: ${familyType === 'solo' ? '1인' : familyType === 'couple' ? '2인 커플' : '가족'}
- 장보는 요일: ${['월','화','수','목','금','토','일'][profile.shopping_day ?? 6]}요일
${prefSection}
${familyGuide}

현재 2주 식단:
${planText || '식단 없음'}

사용 가능한 레시피 목록:
${recipeList}

응답 규칙:
1. 식단 변경 제안 시 반드시 위 레시피 목록에서 선택할 것
2. 각 메뉴 제안에는 추천 이유(영양, 계절성, 재료 활용 등)를 1~2문장으로 설명
3. 특정 날짜/끼니 변경 제안 시 응답 마지막에 아래 형식의 JSON 블록 포함:
\`\`\`json
{"changes":[{"plan_date":"YYYY-MM-DD","meal_type":"breakfast|lunch|dinner","menu_name":"레시피명"}]}
\`\`\`
4. 1인 사용자에게는 특히 간편하고 소량으로 만들기 좋은 메뉴를 강조
5. 아기가 있으면 이유식 분기 자동 안내
6. 친근하고 충분한 설명과 함께 한국어로 답변 (응답이 길어도 괜찮으니 설명을 생략하지 말 것)`;

    // Gemini REST API — 필드명 camelCase 필수
    const contents = [
      ...history.slice(-8).map(h => ({
        role:  h.from === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 }, // disable thinking to maximize text output
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      const geminiMsg = errBody?.error?.message ?? '';
      const status   = geminiRes.status;
      console.error(`[ai/chat] Gemini ${status}:`, geminiMsg || JSON.stringify(errBody));

      if (status === 429) {
        return res.status(429).json({ error: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      }
      if (status === 400) {
        return res.status(400).json({ error: `AI 요청 오류: ${geminiMsg || '다시 시도해주세요.'}` });
      }
      if (status === 403) {
        console.error('[ai/chat] API key invalid or quota exceeded');
        return res.status(503).json({ error: 'AI 서비스 인증 오류입니다. 관리자에게 문의하세요.' });
      }
      return res.status(502).json({ error: `AI 응답 오류 (${status}). 잠시 후 다시 시도해주세요.` });
    }

    const geminiData = await geminiRes.json();
    const candidate  = geminiData.candidates?.[0];

    const finishReason = candidate?.finishReason;

    if (!candidate || finishReason === 'SAFETY') {
      console.error('[ai/chat] blocked, finishReason:', finishReason);
      return res.status(200).json({ text: '해당 요청은 처리할 수 없습니다. 다른 방식으로 질문해주세요.', changes: null });
    }
    if (finishReason === 'MAX_TOKENS') {
      console.error('[ai/chat] response truncated by MAX_TOKENS — increase maxOutputTokens');
    }

    const text = candidate.content?.parts?.[0]?.text ?? '';
    if (!text) {
      return res.status(502).json({ error: 'AI가 응답을 생성하지 못했습니다. 다시 시도해주세요.' });
    }

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    let changes = null;
    if (jsonMatch) {
      try { changes = JSON.parse(jsonMatch[1]).changes ?? null; } catch { /* ignore */ }
    }

    const displayText = text.replace(/```json[\s\S]*?```/g, '').trim();
    return res.json({ text: displayText, changes });

  } catch (err) {
    console.error('[ai/chat] unexpected error:', err.message);
    return res.status(500).json({ error: 'AI 응답 중 오류가 발생했습니다.' });
  }
}
