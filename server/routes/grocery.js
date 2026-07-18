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

async function getFamilyGroupId(userId) {
  const p = await db.getOne('SELECT family_group_id FROM user_profiles WHERE user_id = $1', [userId]);
  return p?.family_group_id ?? null;
}

// 장보기 추천 튜닝 상수
const PURCHASE_LOOKBACK_DAYS = 90; // 영수증/냉장고 구매 이력 조회 기간
const MIN_PURCHASE_COUNT = 2;      // 구매 이력만으로 추천하려면 최소 이 횟수 이상
const TOP_MENU_COUNT = 10;         // 식단 빈도 상위 몇 개 메뉴까지 재료 근거로 쓸지
const MAX_RECOMMENDATIONS = 12;

/**
 * 영수증 기반 자주 구매한 식재료 + 식단에 자주 등장하는 메뉴의 식재료를 근거로
 * 장보기 추천 목록을 계산한다(순수 함수 — 테스트 용이). 이미 냉장고에 있거나
 * 이번 주 장보기 목록에 이미 있는 재료는 제외한다.
 * @param {Array<{name:string, category:string}>} purchaseRows  fridge_items 구매 이력(기간 내)
 * @param {Array<{menu_name:string}>} mealRows                  전체 기간 meal_plans
 * @param {Array<{name:string, ingredients:string}>} recipes    상위 메뉴들의 레시피(ingredients는 JSON 문자열)
 * @param {Set<string>} inStockNames       현재 미소비 재고 이름(소문자)
 * @param {Set<string>} inGroceryListNames 이번 주 장보기 목록에 이미 있는 이름(소문자)
 */
export function computeGroceryRecommendations(purchaseRows, mealRows, recipes, inStockNames, inGroceryListNames) {
  const purchaseFreq = new Map();
  for (const r of purchaseRows) {
    const key = r.name.trim();
    if (!key) continue;
    const cur = purchaseFreq.get(key) || { count: 0, category: r.category };
    cur.count += 1;
    purchaseFreq.set(key, cur);
  }

  const menuFreq = new Map();
  for (const m of mealRows) {
    if (!m.menu_name) continue;
    menuFreq.set(m.menu_name, (menuFreq.get(m.menu_name) || 0) + 1);
  }

  const ingredientMenuScore = new Map();
  for (const recipe of recipes) {
    const ingredients = recipe.ingredients ? JSON.parse(recipe.ingredients) : [];
    const weight = menuFreq.get(recipe.name) || 1;
    for (const ing of (Array.isArray(ingredients) ? ingredients : [])) {
      const key = (ing.name || '').trim();
      if (!key) continue;
      const cur = ingredientMenuScore.get(key) || { weight: 0, qty: ing.qty };
      cur.weight += weight;
      ingredientMenuScore.set(key, cur);
    }
  }

  const names = new Set([...purchaseFreq.keys(), ...ingredientMenuScore.keys()]);
  const recs = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (inStockNames.has(key) || inGroceryListNames.has(key)) continue;
    const p = purchaseFreq.get(name);
    const m = ingredientMenuScore.get(name);
    if (p && !m && p.count < MIN_PURCHASE_COUNT) continue; // 구매 이력만 있는데 횟수 부족하면 제외
    recs.push({
      name,
      qty: m?.qty || '',
      category: p?.category || categorize(name),
      reason: p && m ? 'both' : p ? 'purchase' : 'menu',
      score: (p?.count || 0) * 2 + (m?.weight || 0), // 구매 이력 신호에 더 무게
    });
  }
  recs.sort((a, b) => b.score - a.score);
  return recs.slice(0, MAX_RECOMMENDATIONS);
}

/** meal_plans 에서 가장 자주 계획된 메뉴 이름 상위 N개 */
export function topMenuNames(mealRows, n = TOP_MENU_COUNT) {
  const freq = new Map();
  for (const m of mealRows) {
    if (!m.menu_name) continue;
    freq.set(m.menu_name, (freq.get(m.menu_name) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
}

router.post('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const { week_start, items: manualItems } = req.body ?? {};
    if (!week_start) return res.status(400).json({ error: 'week_start required' });

    // ── 레시피 재료 수동 추가 모드 ─────────────────────────────
    if (Array.isArray(manualItems) && manualItems.length > 0) {
      const existing = await db.getMany(
        'SELECT name FROM grocery_items WHERE user_id = $1 AND week_start = $2',
        [userId, week_start],
      );
      const existingNames = new Set(existing.map(e => e.name.trim().toLowerCase()));
      let added = 0;
      for (const item of manualItems) {
        const name = item.name?.trim();
        if (!name || existingNames.has(name.toLowerCase())) continue;
        await db.run(
          `INSERT INTO grocery_items (id, user_id, week_start, name, qty, category, for_baby, is_bought, menu_count)
           VALUES ($1,$2,$3,$4,$5,$6,0,0,1)`,
          [randomUUID(), userId, week_start, name, item.qty ?? '', item.category ?? categorize(name)],
        );
        added++;
      }
      return res.json({ added });
    }

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

// ── GET /api/grocery/recommend ───────────────────────────
// 영수증(냉장고 구매 이력) 기반 자주 구매한 식재료 + 식단에 자주 등장하는
// 메뉴의 식재료를 근거로 장보기 추천 목록을 반환한다(저장 안 함).
router.get('/recommend', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { week_start } = req.query;
  try {
    const groupId = await getFamilyGroupId(userId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PURCHASE_LOOKBACK_DAYS);
    const cutoffStr = cutoff.toISOString();

    const purchaseRows = groupId
      ? await db.getMany(`SELECT name, category FROM fridge_items WHERE family_group_id = $1 AND added_at >= $2`, [groupId, cutoffStr])
      : await db.getMany(`SELECT name, category FROM fridge_items WHERE user_id = $1 AND family_group_id IS NULL AND added_at >= $2`, [userId, cutoffStr]);

    const mealRows = await db.getMany(`SELECT menu_name FROM meal_plans WHERE user_id = $1 AND menu_name IS NOT NULL`, [userId]);
    const topMenus = topMenuNames(mealRows);
    let recipes = [];
    if (topMenus.length) {
      const placeholders = topMenus.map((_, i) => `$${i + 1}`).join(',');
      recipes = await db.getMany(`SELECT name, ingredients FROM recipes WHERE name IN (${placeholders})`, topMenus);
    }

    const stockRows = groupId
      ? await db.getMany(`SELECT name FROM fridge_items WHERE family_group_id = $1 AND consumed_at IS NULL`, [groupId])
      : await db.getMany(`SELECT name FROM fridge_items WHERE user_id = $1 AND family_group_id IS NULL AND consumed_at IS NULL`, [userId]);
    const inStockNames = new Set(stockRows.map(r => r.name.trim().toLowerCase()));

    let inGroceryListNames = new Set();
    if (week_start) {
      const groceryRows = await db.getMany(`SELECT name FROM grocery_items WHERE user_id = $1 AND week_start = $2`, [userId, week_start]);
      inGroceryListNames = new Set(groceryRows.map(r => r.name.trim().toLowerCase()));
    }

    const recommendations = computeGroceryRecommendations(purchaseRows, mealRows, recipes, inStockNames, inGroceryListNames);
    res.json({ recommendations });
  } catch (err) {
    console.error('[grocery recommend GET]', err.message);
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
