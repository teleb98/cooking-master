import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const CATEGORY_MAP = [
  { cat: '육류',      pattern: /소고기|소갈비|돼지고기|닭가슴살|닭|연어|고등어|바지락/ },
  { cat: '채소',      pattern: /시금치|대파|양파|방울토마토|당근|토마토|오이|아스파라거스|묵은지|표고|단호박|블루베리|바나나|아보카도|콩나물|무|마늘|양상추|미역/ },
  { cat: '유제품',    pattern: /달걀|계란|우유|버터|파마산|그릭요거트/ },
  { cat: '곡물·기타', pattern: /오트밀|쌀|당면|두부면|식빵|그래놀라|두부/ },
];
function categorize(name) {
  for (const { cat, pattern } of CATEGORY_MAP) if (pattern.test(name)) return cat;
  return '기타';
}

router.post('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const { week_start } = req.body ?? {};
    if (!week_start) return res.status(400).json({ error: 'week_start required' });

    const weekEnd = new Date(week_start);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const meals = await db.getMany(
      `SELECT menu_name FROM meal_plans WHERE user_id = $1 AND plan_date >= $2 AND plan_date <= $3 AND menu_name IS NOT NULL`,
      [userId, week_start, weekEndStr],
    );

    const menuNames = [...new Set(meals.map(m => m.menu_name))];
    if (menuNames.length === 0) return res.json({ count: 0 });

    const placeholders = menuNames.map((_, i) => `$${i + 1}`).join(',');
    const recipes = await db.getMany(`SELECT name, ingredients, baby FROM recipes WHERE name IN (${placeholders})`, menuNames);

    const menuCount = {};
    for (const m of meals) menuCount[m.menu_name] = (menuCount[m.menu_name] ?? 0) + 1;

    const ingMap = new Map();
    for (const recipe of recipes) {
      const ingredients = recipe.ingredients ? JSON.parse(recipe.ingredients) : [];
      for (const ing of (Array.isArray(ingredients) ? ingredients : [])) {
        const name = ing.name ?? '';
        if (!name) continue;
        if (ingMap.has(name)) ingMap.get(name).menu_count += 1;
        else ingMap.set(name, { qty: ing.qty ?? '', category: categorize(name), for_baby: !!recipe.baby, menu_count: menuCount[recipe.name] ?? 1 });
      }
    }

    await db.run('DELETE FROM grocery_items WHERE user_id = $1 AND week_start = $2', [userId, week_start]);
    for (const [name, info] of ingMap.entries()) {
      await db.run(
        `INSERT INTO grocery_items (id, user_id, week_start, name, qty, category, for_baby, is_bought, menu_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
        [randomUUID(), userId, week_start, name, info.qty, info.category, info.for_baby ? 1 : 0, info.menu_count],
      );
    }
    res.json({ count: ingMap.size });
  } catch (err) {
    console.error('[grocery POST]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  try {
    const items = await db.getMany(
      'SELECT * FROM grocery_items WHERE user_id = $1 AND week_start = $2 ORDER BY category, name',
      [req.userId, week_start],
    );
    res.json({ items: items.map(i => ({ ...i, for_baby: !!i.for_baby, is_bought: !!i.is_bought })) });
  } catch (err) {
    console.error('[grocery GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  const { id, is_bought } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    await db.run('UPDATE grocery_items SET is_bought = $1 WHERE id = $2 AND user_id = $3', [is_bought ? 1 : 0, id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[grocery PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/', requireAuth, async (req, res) => {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    await db.run('DELETE FROM grocery_items WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[grocery DELETE]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
