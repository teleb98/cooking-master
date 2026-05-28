import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';
import { checkAiLimit, incrementAiUsage } from '../_limits.js';

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

  const limitCheck = await checkAiLimit(db.supabase, userId, 'generate');
  if (!limitCheck.allowed) {
    return res.status(402).json({
      error: limitCheck.isPremium
        ? '이번 달 AI 식단 생성 횟수를 모두 사용했습니다. (월 4회)'
        : 'AI 식단 생성은 월 1회 무료 체험이 제공됩니다. 이번 달 무료 체험을 이미 사용하셨습니다.',
      code: limitCheck.reason,
      used: limitCheck.used,
      limit: limitCheck.limit,
      isPremium: limitCheck.isPremium,
    });
  }

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

    // 자녀 배열 — 새 children 필드 우선, 기존 baby 데이터 폴백
    const rawChildren = Array.isArray(profile.children) && profile.children.length > 0
      ? profile.children
      : (profile.baby_birthday ? [{ name: profile.baby_name, birthday: profile.baby_birthday }] : []);

    function childMonths(bday) {
      return Math.floor((Date.now() - new Date(bday)) / (1000 * 60 * 60 * 24 * 30.44));
    }
    function childLabel(bday) {
      const m = childMonths(bday);
      if (m < 6)   return `이유식 초기(${m}개월)`;
      if (m < 9)   return `이유식 중기(${m}개월)`;
      if (m < 12)  return `이유식 후기(${m}개월)`;
      if (m < 24)  return `이유식 완료기(${m}개월)`;
      if (m < 72)  return `유아 ${Math.floor(m/12)}세`;
      if (m < 156) return `어린이 ${Math.floor(m/12)}세`;
      if (m < 216) return `청소년 ${Math.floor(m/12)}세`;
      return `성인 ${Math.floor(m/12)}세`;
    }

    const hasBaby  = rawChildren.some(c => c.birthday && childMonths(c.birthday) < 24);
    const hasChild = rawChildren.some(c => c.birthday && childMonths(c.birthday) >= 24 && childMonths(c.birthday) < 156);
    const hasTeen  = rawChildren.some(c => c.birthday && childMonths(c.birthday) >= 156 && childMonths(c.birthday) < 216);

    const childrenDesc = rawChildren
      .filter(c => c.birthday)
      .map(c => `${c.name ? c.name + ' ' : ''}(${childLabel(c.birthday)})`)
      .join(', ');

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

## 중요: 각 레시피는 완전한 한 끼 식사 기준 칼로리입니다
- 한식 메뉴: 밥 1공기(300kcal) + 국·찌개 + 메인 반찬 + 기본 반찬 포함
- 양식/건강식 메뉴: 탄수화물 대체(파스타·빵·오트밀 등) + 단백질 + 채소 포함
- 칼로리 목표: 아침 350~500kcal, 점심 550~750kcal, 저녁 550~750kcal (하루 합계 1,700~1,900kcal)

## 사용자 정보
- 가족 유형: ${FAMILY_DESC[familyType] ?? familyType}${rawChildren.length > 0 ? ` + 자녀 ${rawChildren.filter(c=>c.birthday).length}명` : ''}
${childrenDesc ? `- 자녀 구성: ${childrenDesc}` : ''}
${likedMenusLine}
${likedHintsLine}
${noPrefsLine}
- 알레르기·피해야 할 재료: ${allergyText}
${hasBaby  ? '- 이유식기 영아 포함: 이유식 가능(이유식가능) 메뉴 적극 포함, 자극적 양념 최소화' : ''}
${hasChild ? '- 어린이 포함: 매운 음식 최소화, 영양 균형 강조 (칼슘·철분 풍부 식품 포함)' : ''}
${hasTeen  ? '- 청소년 포함: 성장기 단백질·칼슘 충분히 (육류·생선·유제품·콩류 강화)' : ''}

## 사용 가능한 레시피 (이 목록에서만 선택, 메뉴명 정확히 일치)
${recipeList}

## 식단 구성 규칙
1. 반드시 위 레시피 목록에 있는 메뉴명 그대로 사용
2. 알레르기 재료 포함 메뉴는 절대 포함 금지
3. 즐겨찾는 메뉴가 있으면 2주 내 각 메뉴 최소 1회 이상 배치
4. 같은 메뉴를 3일 이상 연속 배치 금지
5. 아침은 350~500kcal 이하 간편식 위주 (오트밀·토스트·요거트 등)

## 건강 식단 필수 규칙
6. 단백질 공급: 육류·생선·두부·달걀 중 하루 최소 2가지 단백질 공급원 포함
7. 채소 다양성: 주 3회 이상 녹황색 채소(시금치·브로콜리·당근 등) 포함 메뉴 배치
8. 영양 균형: 같은 날 아침·점심·저녁이 모두 고칼로리 고지방 메뉴가 되지 않도록 조절
9. 주간 패턴: 1주 내 생선 2회, 콩류(두부 포함) 2회, 채소 위주 메뉴 1회 이상 포함
10. 14일 × 아침·점심·저녁 = 총 42개 항목 전부 포함

JSON 형식으로만 응답 (설명 없이):
{"plan":[{"plan_date":"YYYY-MM-DD","meal_type":"breakfast","menu_name":"메뉴명"},...]}`;

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

    await incrementAiUsage(db.supabase, userId, 'generate');
    return res.json({ plan: validPlan, count: validPlan.length });
  } catch (err) {
    console.error('[generate-plan] unexpected error:', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
