import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getMondayOf(offset = 0) {
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

const FAMILY_DESC = { solo: '1인', couple: '2인 커플', family: '가족' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });

  try {
    const [profileRes] = await Promise.all([
      db.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    // 공유 레시피 + 사용자 커스텀 레시피 (user_id 컬럼 없는 경우 전체 폴백)
    const recipesFiltered = await db.supabase.from('recipes').select('name, kcal, baby, tags')
      .or(`user_id.is.null,user_id.eq.${userId}`).order('name');
    const allRecipes = (recipesFiltered.error
      ? (await db.supabase.from('recipes').select('name, kcal, baby, tags').order('name')).data
      : recipesFiltered.data) ?? [];

    const profile = profileRes.data ?? {};
    if (allRecipes.length === 0) return res.status(500).json({ error: '레시피 데이터가 없습니다.' });

    const familyType = profile.family_type ?? 'couple';
    const foodLikes  = Array.isArray(profile.food_likes) ? profile.food_likes : [];
    const allergies  = Array.isArray(profile.allergies)  ? profile.allergies  : [];
    const hasBaby    = !!profile.baby_birthday;

    // 2주 날짜 (14일)
    const week1Start = getMondayOf(0);
    const dates = Array.from({ length: 14 }, (_, i) => addDays(week1Start, i));

    const recipeList = allRecipes.map(r =>
      `${r.name}(${r.kcal}kcal${r.baby ? ',이유식가능' : ''})`
    ).join(', ');

    // food_likes를 레시피 목록과 대조해 즐겨찾는 메뉴와 선호 재료로 분리
    const recipeNameSet = new Set(allRecipes.map(r => r.name));
    const likedMenus = foodLikes.filter(l => recipeNameSet.has(l));
    const likedHints = foodLikes.filter(l => !recipeNameSet.has(l));

    const allergyText    = allergies.length  > 0 ? allergies.join(', ')  : '없음';
    const likedMenusLine = likedMenus.length > 0
      ? `- 즐겨찾는 메뉴 (2주 식단에 각 메뉴 최소 1회 이상 반드시 배치): ${likedMenus.join(', ')}`
      : '';
    const likedHintsLine = likedHints.length > 0
      ? `- 선호 재료·스타일 (관련 메뉴 우선): ${likedHints.join(', ')}`
      : '';
    const noPrefsLine    = !likedMenusLine && !likedHintsLine ? '- 취향: 제한 없음' : '';

    const userPrompt = `다음 조건으로 ${dates[0]}부터 ${dates[13]}까지 2주 식단을 생성하세요.

사용자 정보:
- 가족 유형: ${FAMILY_DESC[familyType] ?? familyType}
${likedMenusLine}
${likedHintsLine}
${noPrefsLine}
- 알레르기·피해야 할 재료: ${allergyText}
${hasBaby ? '- 영·유아 포함 가족: 이유식 가능 표시 메뉴 우선 고려' : ''}

사용 가능한 레시피 (이 목록에서만 선택, 메뉴명 정확히 일치):
${recipeList}

규칙:
1. 반드시 위 레시피 목록에 있는 메뉴명 그대로 사용
2. 알레르기 재료 포함 메뉴는 절대 포함 금지
3. 즐겨찾는 메뉴가 있으면 2주 내 각 메뉴를 최소 1회 이상 배치하고, 선호도가 높은 메뉴는 더 자주 반영
4. 선호 재료가 포함된 메뉴를 다른 메뉴보다 우선 배치
5. 같은 메뉴를 3일 이상 연속 배치 금지
6. 아침은 비교적 간단한 메뉴 위주
7. 14일 × 아침·점심·저녁 = 총 42개 항목 전부 포함

JSON 형식으로만 응답 (설명 없이):
{"plan":[{"plan_date":"YYYY-MM-DD","meal_type":"breakfast","menu_name":"메뉴명"},...]}`;;

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: '당신은 한국 가정 식단 생성 AI입니다. 반드시 JSON만 출력하세요.' }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.75,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
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
      const status = geminiRes.status;
      console.error('[generate-plan] Gemini', status);
      if (status === 429) return res.status(429).json({ error: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      return res.status(502).json({ error: `AI 오류 (${status})` });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return res.status(502).json({ error: 'AI가 응답을 생성하지 못했습니다.' });

    let plan = [];
    try {
      const parsed = JSON.parse(text);
      plan = parsed.plan ?? [];
    } catch {
      // Try to extract JSON block if responseMimeType wasn't honored
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { plan = JSON.parse(m[0]).plan ?? []; } catch { /* ignore */ }
      }
    }

    if (plan.length === 0) {
      console.error('[generate-plan] empty plan, raw text:', text.slice(0, 200));
      return res.status(502).json({ error: '식단을 생성하지 못했습니다. 다시 시도해주세요.' });
    }

    // Validate: only accept entries with known recipe names
    const recipeMap = new Map(allRecipes.map(r => [r.name, r]));
    const validPlan = plan.filter(e =>
      e.plan_date && e.meal_type && e.menu_name && recipeMap.has(e.menu_name)
    );

    if (validPlan.length === 0) {
      console.error('[generate-plan] no valid entries after validation');
      return res.status(502).json({ error: '유효한 메뉴를 생성하지 못했습니다. 다시 시도해주세요.' });
    }

    // Upsert all entries
    const rows = validPlan.map(e => {
      const recipe = recipeMap.get(e.menu_name);
      return {
        user_id:   userId,
        plan_date: e.plan_date,
        meal_type: e.meal_type,
        menu_name: e.menu_name,
        kcal:      recipe?.kcal ?? null,
        is_baby:   recipe?.baby ?? false,
      };
    });

    const { error: upsertErr } = await db.supabase
      .from('meal_plans')
      .upsert(rows, { onConflict: 'user_id,plan_date,meal_type' });

    if (upsertErr) {
      console.error('[generate-plan] upsert error:', upsertErr.message);
      return res.status(500).json({ error: '식단 저장에 실패했습니다.' });
    }

    return res.json({ plan: validPlan, count: validPlan.length });
  } catch (err) {
    console.error('[generate-plan] unexpected error:', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
