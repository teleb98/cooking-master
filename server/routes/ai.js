import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { checkAiLimit, incrementAiUsage } from '../_limits.js';

const router = Router();
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const DAY_KR = ['월', '화', '수', '목', '금', '토', '일'];
const FAMILY_DESC = { solo: '1인', couple: '2인 커플', family: '가족' };

// 로컬 날짜(KST 등) 기준 YYYY-MM-DD 문자열 반환
function localDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// 로컬 기준 이번 주 월요일 + offset 주
function getMonday(offset = 0) {
  const today = new Date();
  const dow = today.getDay(); // 로컬 요일 (0=일, 1=월, ...)
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return localDateStr(mon);
}

// 날짜 문자열(YYYY-MM-DD)에 n일 더하기
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00'); // 로컬 자정 기준 파싱
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function parseProfile(p) {
  if (!p) return {};
  return {
    ...p,
    children:   p.children ? JSON.parse(p.children) : [],
    food_likes: p.food_likes ? JSON.parse(p.food_likes) : [],
    allergies:  p.allergies ? JSON.parse(p.allergies) : [],
  };
}

// POST /api/ai/chat
router.post('/chat', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { message, history = [], identify_food, image_base64, mime_type } = req.body ?? {};

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });

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

  const limitCheck = await checkAiLimit(userId, 'chat');
  if (!limitCheck.allowed) {
    return res.status(402).json({
      error: limitCheck.isPremium
        ? '이번 달 AI 채팅 횟수를 모두 사용했습니다. (월 30턴)'
        : 'AI 채팅은 월 5턴 무료 체험이 제공됩니다. 이번 달 무료 체험을 모두 사용하셨습니다.',
      code: limitCheck.reason, used: limitCheck.used, limit: limitCheck.limit, isPremium: limitCheck.isPremium,
    });
  }

  try {
    const todayStr    = localDateStr(new Date());
    const todayDowIdx = new Date().getDay(); // 0=일
    const todayDowKr  = DAY_KR[todayDowIdx === 0 ? 6 : todayDowIdx - 1];
    const week1       = getMonday(0);  // 이번 주 월요일
    const week1End    = addDays(week1, 6);  // 이번 주 일요일
    const week2       = getMonday(1);  // 다음 주 월요일
    const week2End    = addDays(week2, 6);  // 다음 주 일요일
    const weekEnd     = week2End;

    const [meals, profileRow, recipeRows] = await Promise.all([
      db.getMany('SELECT * FROM meal_plans WHERE user_id = $1 AND plan_date >= $2 AND plan_date <= $3 ORDER BY plan_date, meal_type', [userId, week1, weekEnd]),
      db.getOne('SELECT * FROM user_profiles WHERE user_id = $1', [userId]),
      db.getMany('SELECT name, kcal, baby, tags FROM recipes WHERE user_id IS NULL OR user_id = $1 ORDER BY name', [userId]),
    ]);
    const profile = parseProfile(profileRow);
    const allRecipes = recipeRows.map(r => ({ ...r, baby: !!r.baby }));

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

    const recipeList = allRecipes.map(r => `${r.name}(${r.kcal}kcal${r.baby ? ',이유식' : ''})`).join(', ');

    const hasBaby    = !!profile.baby_birthday;
    const babyMonths = hasBaby ? Math.floor((Date.now() - new Date(profile.baby_birthday)) / (1000 * 60 * 60 * 24 * 30.44)) : null;
    const familyType = profile.family_type ?? 'couple';
    const foodLikes  = profile.food_likes ?? [];
    const allergies  = profile.allergies ?? [];

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

    const recipeNameSet = new Set(allRecipes.map(r => r.name));
    const likedMenus = foodLikes.filter(l => recipeNameSet.has(l));
    const likedHints = foodLikes.filter(l => !recipeNameSet.has(l));

    const prefLines = [];
    if (likedMenus.length > 0) prefLines.push(`- 즐겨찾는 메뉴 (식단 수정 시 우선 반영, 가능하면 포함): ${likedMenus.join(', ')}`);
    if (likedHints.length  > 0) prefLines.push(`- 선호 재료·스타일: ${likedHints.join(', ')}`);
    if (allergies.length   > 0) prefLines.push(`- 알레르기·피해야 할 재료: ${allergies.join(', ')} (이 재료가 포함된 메뉴는 절대 추천하지 말 것)`);

    const prefSection = prefLines.length > 0 ? `\n사용자 취향:\n${prefLines.join('\n')}` : '';

    const systemPrompt = `당신은 한국 가족의 식단 관리를 돕는 AI 어시스턴트 'Cooking Master'입니다.

## 날짜 기준 (절대 준수)
- 오늘: ${todayStr} (${todayDowKr}요일)
- 이번 주: ${week1}(월) ~ ${week1End}(일)
- 다음 주: ${week2}(월) ~ ${week2End}(일)
- 한국 기준 주는 반드시 **월요일 시작 ~ 일요일 종료**입니다.
- 사용자가 "다음 주"라고 하면 반드시 ${week2}(월) ~ ${week2End}(일) 날짜를 사용하세요.
- 식단 변경 JSON에는 반드시 위 날짜 범위 안의 YYYY-MM-DD만 사용하세요.

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

    const contents = [
      ...history.slice(-8).map(h => ({ role: h.from === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
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
      const status = geminiRes.status;
      console.error(`[ai/chat] Gemini ${status}:`, geminiMsg || JSON.stringify(errBody));
      if (status === 429) return res.status(429).json({ error: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      if (status === 400) return res.status(400).json({ error: `AI 요청 오류: ${geminiMsg || '다시 시도해주세요.'}` });
      if (status === 403) return res.status(503).json({ error: 'AI 서비스 인증 오류입니다. 관리자에게 문의하세요.' });
      return res.status(502).json({ error: `AI 응답 오류 (${status}). 잠시 후 다시 시도해주세요.` });
    }

    const geminiData = await geminiRes.json();
    const candidate  = geminiData.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (!candidate || finishReason === 'SAFETY') {
      return res.status(200).json({ text: '해당 요청은 처리할 수 없습니다. 다른 방식으로 질문해주세요.', changes: null });
    }

    const text = candidate.content?.parts?.[0]?.text ?? '';
    if (!text) return res.status(502).json({ error: 'AI가 응답을 생성하지 못했습니다. 다시 시도해주세요.' });

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    let changes = null;
    if (jsonMatch) { try { changes = JSON.parse(jsonMatch[1]).changes ?? null; } catch { /* ignore */ } }

    await incrementAiUsage(userId, 'chat');
    const displayText = text.replace(/```json[\s\S]*?```/g, '').trim();
    return res.json({ text: displayText, changes });
  } catch (err) {
    console.error('[ai/chat] unexpected error:', err.message);
    return res.status(500).json({ error: 'AI 응답 중 오류가 발생했습니다.' });
  }
});

// POST /api/ai/generate-plan
router.post('/generate-plan', requireAuth, async (req, res) => {
  const userId = req.userId;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });

  const limitCheck = await checkAiLimit(userId, 'generate');
  if (!limitCheck.allowed) {
    return res.status(402).json({
      error: limitCheck.isPremium
        ? '이번 달 AI 식단 생성 횟수를 모두 사용했습니다. (월 4회)'
        : 'AI 식단 생성은 월 1회 무료 체험이 제공됩니다. 이번 달 무료 체험을 이미 사용하셨습니다.',
      code: limitCheck.reason, used: limitCheck.used, limit: limitCheck.limit, isPremium: limitCheck.isPremium,
    });
  }

  try {
    const [profileRow, recipeRows] = await Promise.all([
      db.getOne('SELECT * FROM user_profiles WHERE user_id = $1', [userId]),
      db.getMany('SELECT name, kcal, baby, tags FROM recipes WHERE user_id IS NULL OR user_id = $1 ORDER BY name', [userId]),
    ]);
    const profile = parseProfile(profileRow);
    const allRecipes = recipeRows.map(r => ({ ...r, baby: !!r.baby }));
    if (allRecipes.length === 0) return res.status(500).json({ error: '레시피 데이터가 없습니다.' });

    const familyType = profile.family_type ?? 'couple';
    const foodLikes  = profile.food_likes ?? [];
    const allergies  = profile.allergies ?? [];

    const rawChildren = profile.children?.length > 0
      ? profile.children
      : (profile.baby_birthday ? [{ name: profile.baby_name, birthday: profile.baby_birthday }] : []);

    function childMonths(bday) { return Math.floor((Date.now() - new Date(bday)) / (1000 * 60 * 60 * 24 * 30.44)); }
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

    const childrenDesc = rawChildren.filter(c => c.birthday).map(c => `${c.name ? c.name + ' ' : ''}(${childLabel(c.birthday)})`).join(', ');

    const week1Start = getMonday(0);
    const dates = Array.from({ length: 14 }, (_, i) => addDays(week1Start, i));

    const recipeList = allRecipes.map(r => `${r.name}(${r.kcal}kcal${r.baby ? ',이유식가능' : ''})`).join(', ');

    const recipeNameSet = new Set(allRecipes.map(r => r.name));
    const likedMenus = foodLikes.filter(l => recipeNameSet.has(l));
    const likedHints = foodLikes.filter(l => !recipeNameSet.has(l));

    const allergyText    = allergies.length  > 0 ? allergies.join(', ')  : '없음';
    const likedMenusLine = likedMenus.length > 0 ? `- 즐겨찾는 메뉴 (2주 식단에 각 메뉴 최소 1회 이상 반드시 배치): ${likedMenus.join(', ')}` : '';
    const likedHintsLine = likedHints.length > 0 ? `- 선호 재료·스타일 (관련 메뉴 우선): ${likedHints.join(', ')}` : '';
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

## 날짜 표기 규칙 (중요)
- 날짜는 직접 계산하지 말고, "day" 필드에 1~14 사이의 정수(몇 번째 날인지)만 적으세요.
- day=1은 ${dates[0]} (1주차 월요일), day=14는 ${dates[13]} (2주차 일요일)입니다.
- 실제 날짜 문자열(YYYY-MM-DD)은 서버에서 day 값으로부터 계산하므로 절대 plan_date를 직접 쓰지 마세요.

JSON 형식으로만 응답 (설명 없이):
{"plan":[{"day":1,"meal_type":"breakfast","menu_name":"메뉴명"},...]}`;

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: '당신은 한국 가정 식단 생성 AI입니다. 반드시 JSON만 출력하세요.' }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.75, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
    try { plan = JSON.parse(text).plan ?? []; }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { plan = JSON.parse(m[0]).plan ?? []; } catch { /* ignore */ } }
    }

    if (plan.length === 0) return res.status(502).json({ error: '식단을 생성하지 못했습니다. 다시 시도해주세요.' });

    const recipeMap = new Map(allRecipes.map(r => [r.name, r]));
    const validPlan = plan.filter(e => {
      const day = Number(e.day);
      if (!Number.isInteger(day) || day < 1 || day > 14 || !e.meal_type || !e.menu_name || !recipeMap.has(e.menu_name)) return false;
      e.plan_date = dates[day - 1];
      return true;
    });

    if (validPlan.length === 0) return res.status(502).json({ error: '유효한 메뉴를 생성하지 못했습니다. 다시 시도해주세요.' });

    for (const e of validPlan) {
      const recipe = recipeMap.get(e.menu_name);
      const kcal = recipe?.kcal ?? null;
      const isBaby = recipe?.baby ? 1 : 0;
      const existing = await db.getOne(
        'SELECT id FROM meal_plans WHERE user_id = $1 AND plan_date = $2 AND meal_type = $3',
        [userId, e.plan_date, e.meal_type],
      );
      if (existing) {
        await db.run('UPDATE meal_plans SET menu_name = $1, kcal = $2, is_baby = $3 WHERE id = $4',
          [e.menu_name, kcal, isBaby, existing.id]);
      } else {
        const { randomUUID } = await import('crypto');
        await db.run(
          'INSERT INTO meal_plans (id, user_id, plan_date, meal_type, menu_name, kcal, is_baby) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), userId, e.plan_date, e.meal_type, e.menu_name, kcal, isBaby],
        );
      }
    }

    await incrementAiUsage(userId, 'generate');
    return res.json({ plan: validPlan, count: validPlan.length });
  } catch (err) {
    console.error('[generate-plan] unexpected error:', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
