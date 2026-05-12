import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const BASE_SELECT   = 'name, kcal, baby, baby_note, tags, ingredients';
const DETAIL_SELECT = 'name, kcal, baby, baby_note, tags, ingredients, steps, prep_time, cook_time, serving, tips, nutrition';

async function selectRecipe(supabase, name) {
  // 신규 컬럼 포함 조회 시도, 컬럼 없으면 기본 컬럼으로 fallback
  const full = await supabase.from('recipes').select(DETAIL_SELECT).eq('name', name).maybeSingle();
  if (!full.error) return full;
  const base = await supabase.from('recipes').select(BASE_SELECT).eq('name', name).maybeSingle();
  return base;
}

async function generateDetail(recipe) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const ingList = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map(i => `${i.name} ${i.qty}`).join(', ')
    : '정보 없음';

  const prompt = `한국 가정식 "${recipe.name}" 레시피의 상세 조리법을 JSON으로 생성하세요.
재료 (${recipe.kcal}kcal): ${ingList}

규칙:
- steps: 5~8개, 각 단계 2~3문장으로 구체적으로 (불 세기, 시간, 색깔 변화 등 포함)
- prep_time / cook_time: 분 단위 정수
- serving: 인분 (기본 2인분)
- tips: 실용적인 조리 팁 1~2문장
- nutrition: 1인분 기준 (protein_g, carb_g, fat_g, fiber_g)

JSON만 출력 (설명 없이):
{"prep_time":10,"cook_time":20,"serving":2,"steps":["1단계...","2단계..."],"tips":"팁...","nutrition":{"protein_g":25,"carb_g":45,"fat_g":12,"fiber_g":3}}`;

  const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: '당신은 한국 가정식 요리 전문가입니다. 반드시 JSON만 출력하세요.' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.5,
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
    if (status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 });
    throw Object.assign(new Error(`Gemini ${status}`), { status: 502 });
  }

  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let detail = {};
  try {
    detail = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) try { detail = JSON.parse(m[0]); } catch { /* ignore */ }
  }

  return {
    steps:     Array.isArray(detail.steps) ? detail.steps : [],
    prep_time: detail.prep_time  ?? null,
    cook_time: detail.cook_time  ?? null,
    serving:   detail.serving    ?? null,
    tips:      detail.tips       ?? null,
    nutrition: detail.nutrition  ?? null,
  };
}

export default async function handler(req, res) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  /* ── POST: AI로 조리법 생성 후 DB 저장, 전체 레시피 반환 ── */
  if (req.method === 'POST') {
    const { name } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name required' });

    try {
      const { data: recipe, error } = await selectRecipe(db.supabase, name);
      if (error) throw error;
      if (!recipe) return res.status(404).json({ error: '레시피를 찾을 수 없습니다.' });

      // 이미 조리법 있으면 바로 반환
      if (Array.isArray(recipe.steps) && recipe.steps.length > 0) {
        return res.json({ recipe });
      }

      const detail = await generateDetail(recipe);

      await db.supabase.from('recipes').update(detail).eq('name', name);

      return res.json({ recipe: { ...recipe, ...detail } });
    } catch (err) {
      console.error('[recipes POST]', err.message);
      if (err.status === 429) return res.status(429).json({ error: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      if (err.status === 502) return res.status(502).json({ error: 'AI 응답 오류가 발생했습니다.' });
      return res.status(500).json({ error: 'Server error' });
    }
  }

  /* ── GET ── */
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { name } = req.query;

    if (name) {
      const { data, error } = await selectRecipe(db.supabase, name);
      if (error) throw error;
      return res.json({ recipe: data ?? null });
    }

    const fullList = await db.supabase
      .from('recipes')
      .select('name, kcal, baby, baby_note, tags, prep_time, cook_time, serving, ingredients')
      .order('name');

    const { data, error } = fullList.error
      ? await db.supabase.from('recipes').select('name, kcal, baby, baby_note, tags').order('name')
      : fullList;

    if (error) throw error;
    res.json({ recipes: data ?? [] });
  } catch (err) {
    console.error('[recipes GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
