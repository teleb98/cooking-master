import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function parseRecipeRow(row) {
  if (!row) return row;
  return {
    ...row,
    baby: !!row.baby,
    ingredients: row.ingredients ? JSON.parse(row.ingredients) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    steps: row.steps ? JSON.parse(row.steps) : [],
    nutrition: row.nutrition ? JSON.parse(row.nutrition) : null,
  };
}

async function selectRecipe(name, userId) {
  return db.getOne(
    `SELECT name, kcal, baby, baby_note, tags, ingredients, steps, prep_time, cook_time, serving, tips, nutrition, user_id
     FROM recipes WHERE name = $1 AND (user_id IS NULL OR user_id = $2)`,
    [name, userId],
  );
}

async function generateDetail(recipe) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const ingredients = recipe.ingredients ? JSON.parse(recipe.ingredients) : [];
  const ingList = Array.isArray(ingredients) ? ingredients.map(i => `${i.name} ${i.qty}`).join(', ') : '정보 없음';

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
      generationConfig: { maxOutputTokens: 2048, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
  try { detail = JSON.parse(text); }
  catch {
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

router.delete('/', requireAuth, async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    await db.run('DELETE FROM recipes WHERE name = $1 AND user_id = $2', [name, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[recipes DELETE]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { name, create, kcal, tags, ingredients } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });

  if (create) {
    try {
      const profile = await db.getOne(
        'SELECT plan, plan_expires_at, is_admin, is_test FROM user_profiles WHERE user_id = $1', [userId],
      );
      const isPremiumOrAbove = profile?.is_admin || profile?.is_test ||
        (profile?.plan === 'premium' && (!profile.plan_expires_at || new Date(profile.plan_expires_at) > new Date()));

      if (!isPremiumOrAbove) {
        const { count } = await db.getOne('SELECT COUNT(*) as count FROM recipes WHERE user_id = $1', [userId]);
        if ((count ?? 0) >= 5) {
          return res.status(402).json({ error: '무료 플랜에서는 커스텀 레시피를 최대 5개까지 추가할 수 있습니다.', code: 'recipe_limit' });
        }
      }

      const dup = await db.getOne('SELECT id FROM recipes WHERE name = $1', [name]);
      if (dup) return res.status(409).json({ error: '같은 이름의 레시피가 이미 있습니다.' });

      const id = randomUUID();
      await db.run(
        `INSERT INTO recipes (id, name, kcal, tags, ingredients, baby, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, name, kcal ? Number(kcal) : null, JSON.stringify(Array.isArray(tags) ? tags : []),
         JSON.stringify(Array.isArray(ingredients) ? ingredients : []), 0, userId],
      );
      const recipe = await db.getOne('SELECT * FROM recipes WHERE id = $1', [id]);
      return res.json({ recipe: parseRecipeRow(recipe) });
    } catch (err) {
      console.error('[recipes POST create]', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  try {
    const recipe = await selectRecipe(name, userId);
    if (!recipe) return res.status(404).json({ error: '레시피를 찾을 수 없습니다.' });

    const existingSteps = recipe.steps ? JSON.parse(recipe.steps) : [];
    if (Array.isArray(existingSteps) && existingSteps.length > 0) {
      return res.json({ recipe: parseRecipeRow(recipe) });
    }

    const detail = await generateDetail(recipe);
    await db.run(
      `UPDATE recipes SET steps = $1, prep_time = $2, cook_time = $3, serving = $4, tips = $5, nutrition = $6 WHERE name = $7`,
      [JSON.stringify(detail.steps), detail.prep_time, detail.cook_time, detail.serving, detail.tips,
       detail.nutrition ? JSON.stringify(detail.nutrition) : null, name],
    );
    return res.json({ recipe: parseRecipeRow({ ...recipe, ...detail, steps: JSON.stringify(detail.steps), nutrition: detail.nutrition ? JSON.stringify(detail.nutrition) : null }) });
  } catch (err) {
    console.error('[recipes POST]', err.message);
    if (err.status === 429) return res.status(429).json({ error: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    if (err.status === 502) return res.status(502).json({ error: 'AI 응답 오류가 발생했습니다.' });
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const { name } = req.query;
    if (name) {
      const recipe = await selectRecipe(name, userId);
      return res.json({ recipe: recipe ? parseRecipeRow(recipe) : null });
    }

    const rows = await db.getMany(
      `SELECT name, kcal, baby, baby_note, tags, prep_time, cook_time, serving, ingredients, user_id
       FROM recipes WHERE user_id IS NULL OR user_id = $1 ORDER BY name`,
      [userId],
    );
    res.json({ recipes: rows.map(parseRecipeRow) });
  } catch (err) {
    console.error('[recipes GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
