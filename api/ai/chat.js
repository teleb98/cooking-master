import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';
import { checkAiLimit, incrementAiUsage } from '../_limits.js';

// gemini-2.5-flash: latest stable flash model, confirmed working
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getMonday(offset = 0) {
  const today = new Date();
  const dow = today.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setUTCDate(today.getUTCDate() + diff + offset * 7);
  mon.setUTCHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY_KR = ['월', '화', '수', '목', '금', '토', '일'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  const { message, history = [], identify_food, image_base64, mime_type } = req.body ?? {};

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });

  // ── 음식 사진 인식 모드 ─────────────────────────────────────
  if (identify_food) {
    if (!image_base64) return res.status(400).json({ error: 'image_base64 required' });
    try {
      const visionRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: mime_type ?? 'image/jpeg', data: image_base64 } },
            { text: '이 사진에 있는 음식의 이름을 한국어로 알려주세요. 음식 이름만 짧게(1~4단어) 대답하세요. 음식이 아닌 경우 "알 수 없음"으로만 답하세요.' },
          ]}],
          generationConfig: { maxOutputTokens: 30, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
      if (!visionRes.ok) {
        const s = visionRes.status;
        if (s === 429) return res.status(429).json({ error: 'AI 요청이 너무 많습니다.' });
        return res.status(502).json({ error: `AI 오류 (${s})` });
      }
      const vdata = await visionRes.json();
      const vtext = vdata.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      return res.json({ name: (!vtext || vtext === '알 수 없음') ? null : vtext });
    } catch (err) {
      console.error('[ai/chat identify]', err.message);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  }

  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  const limitCheck = await checkAiLimit(db.supabase, userId, 'chat');
  if (!limitCheck.allowed) {
    return res.status(402).json({
      error: limitCheck.isPremium
        ? '이번 달 AI 채팅 횟수를 모두 사용했습니다. (월 30턴)'
        : 'AI 채팅은 월 5턴 무료 체험이 제공됩니다. 이번 달 무료 체험을 모두 사용하셨습니다.',
      code: limitCheck.reason,
      used: limitCheck.used,
      limit: limitCheck.limit,
      isPremium: limitCheck.isPremium,
    });
  }

  try {
    const week1   = getMonday(0);
    const weekEnd = addDays(getMonday(1), 6);

    const [mealsRes, profileRes] = await Promise.all([
      db.supabase.from('meal_plans').select('*').eq('user_id', userId)
        .gte('plan_date', week1).lte('plan_date', weekEnd).order('plan_date').order('meal_type'),
      db.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    // 공유 레시피 + 사용자 커스텀 레시피 (user_id 컬럼 없는 경우 전체 폴백)
    const recipesFiltered = await db.supabase.from('recipes').select('name, kcal, baby, tags')
      .or(`user_id.is.null,user_id.eq.${userId}`).order('name');
    const allRecipes = (recipesFiltered.error
      ? (await db.supabase.from('recipes').select('name, kcal, baby, tags').order('name')).data
      : recipesFiltered.data) ?? [];

    const meals   = mealsRes.data ?? [];
    const profile = profileRes.data ?? {};

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

    // food_likes를 레시피 목록과 대조해 즐겨찾는 메뉴와 선호 힌트로 분리
    const recipeNameSet = new Set(allRecipes.map(r => r.name));
    const likedMenus = foodLikes.filter(l => recipeNameSet.has(l));
    const likedHints = foodLikes.filter(l => !recipeNameSet.has(l));

    const prefLines = [];
    if (likedMenus.length > 0) prefLines.push(`- 즐겨찾는 메뉴 (식단 수정 시 우선 반영, 가능하면 포함): ${likedMenus.join(', ')}`);
    if (likedHints.length  > 0) prefLines.push(`- 선호 재료·스타일: ${likedHints.join(', ')}`);
    if (allergies.length   > 0) prefLines.push(`- 알레르기·피해야 할 재료: ${allergies.join(', ')} (이 재료가 포함된 메뉴는 절대 추천하지 말 것)`);

    const prefSection = prefLines.length > 0 ? `\n사용자 취향:\n${prefLines.join('\n')}` : '';

    const systemPrompt = `당신은 한국 가족의 식단 관리를 돕는 AI 어시스턴트 'Cooking Master'입니다.

## 레시피 칼로리 기준 (중요)
모든 레시피 칼로리는 완전한 한 끼 식사 기준입니다.
- 한식: 밥 1공기(300kcal) + 국·찌개 + 메인 반찬 + 기본 반찬 포함
- 양식/건강식: 탄수화물(파스타·빵·오트밀 등) + 단백질 + 채소 포함
- 목표: 아침 350~500kcal · 점심 550~750kcal · 저녁 550~750kcal · 하루 합계 1,700~1,900kcal

## 건강 식단 원칙
- 단백질: 하루 최소 2가지 단백질 공급원(육류·생선·두부·달걀) 포함
- 채소: 주 3회 이상 녹황색 채소 포함 메뉴 배치
- 균형: 같은 날 세 끼가 모두 고칼로리·고지방이 되지 않도록 조절
- 다양성: 생선 주 2회, 콩류(두부) 주 2회 이상 권장

## 가족 정보
- 유형: ${familyType === 'solo' ? '1인' : familyType === 'couple' ? '2인 커플' : '가족'}
- 장보는 요일: ${['월','화','수','목','금','토','일'][profile.shopping_day ?? 6]}요일
${prefSection}
${familyGuide}

## 현재 2주 식단
${planText || '식단 없음'}

## 사용 가능한 레시피 목록
${recipeList}

## 응답 규칙
1. 식단 변경 제안 시 반드시 위 레시피 목록에서 선택할 것
2. 칼로리 검토 요청 시: 하루 합계(아침+점심+저녁)를 계산하고, 1,700~1,900kcal 범위인지 확인
3. 각 메뉴 제안에는 추천 이유(영양, 건강, 재료 활용 등)를 1~2문장으로 설명
4. 특정 날짜/끼니 변경 제안 시 응답 마지막에 아래 형식의 JSON 블록 포함:
\`\`\`json
{"changes":[{"plan_date":"YYYY-MM-DD","meal_type":"breakfast|lunch|dinner","menu_name":"레시피명"}]}
\`\`\`
5. 1인 사용자에게는 간편하고 소량으로 만들기 좋은 메뉴를 강조
6. 아기가 있으면 이유식 분기 자동 안내
7. 친근하고 충분한 설명과 함께 한국어로 답변`;

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

    await incrementAiUsage(db.supabase, userId, 'chat');
    const displayText = text.replace(/```json[\s\S]*?```/g, '').trim();
    return res.json({ text: displayText, changes });

  } catch (err) {
    console.error('[ai/chat] unexpected error:', err.message);
    return res.status(500).json({ error: 'AI 응답 중 오류가 발생했습니다.' });
  }
}
