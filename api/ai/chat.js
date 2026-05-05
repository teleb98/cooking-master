import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

// gemini-1.5-flash: stable, generous free tier (15 RPM / 1500 RPD)
const GEMINI_MODEL = 'gemini-1.5-flash';
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

    const systemPrompt = `당신은 한국 가족의 식단 관리를 돕는 AI 어시스턴트 'Cooking Master'입니다.

가족 정보:
- 유형: ${familyType === 'solo' ? '1인' : familyType === 'couple' ? '2인 부부' : '가족'}
${hasBaby ? `- 아기: ${babyMonths}개월 (${babyMonths < 6 ? '초기' : babyMonths < 9 ? '중기' : babyMonths < 12 ? '후기' : '완료기'} 이유식)` : ''}
- 장보는 요일: ${['월','화','수','목','금','토','일'][profile.shopping_day ?? 6]}요일

현재 2주 식단:
${planText || '식단 없음'}

사용 가능한 레시피 목록:
${recipeList}

응답 규칙:
1. 식단 변경 제안 시 반드시 위 레시피 목록에서 선택할 것
2. 특정 날짜/끼니 변경 제안 시 응답 마지막에 아래 형식의 JSON 블록 포함:
\`\`\`json
{"changes":[{"plan_date":"YYYY-MM-DD","meal_type":"breakfast|lunch|dinner","menu_name":"레시피명"}]}
\`\`\`
3. 아기가 있으면 이유식 분기 자동 안내
4. 친근하고 간결하게 한국어로 답변`;

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
        systemInstruction: { parts: [{ text: systemPrompt }] },   // camelCase
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }, // camelCase
        safetySettings: [                                              // camelCase
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

    // 안전 필터 등으로 응답 차단된 경우
    if (!candidate || candidate.finishReason === 'SAFETY') {
      console.error('[ai/chat] blocked, finishReason:', candidate?.finishReason);
      return res.status(200).json({ text: '해당 요청은 처리할 수 없습니다. 다른 방식으로 질문해주세요.', changes: null });
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
