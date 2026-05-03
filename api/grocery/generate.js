import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const CATEGORY_MAP = [
  { cat: '육류',    pattern: /소고기|소갈비|돼지고기|닭가슴살|닭|연어|고등어|바지락/ },
  { cat: '채소',    pattern: /시금치|대파|양파|방울토마토|당근|토마토|오이|아스파라거스|묵은지|표고|단호박|블루베리|바나나|아보카도|콩나물|무|마늘|양상추|미역/ },
  { cat: '유제품',  pattern: /달걀|계란|우유|버터|파마산|그릭요거트/ },
  { cat: '곡물·기타', pattern: /오트밀|쌀|당면|두부면|식빵|그래놀라|두부/ },
];

function categorize(name) {
  for (const { cat, pattern } of CATEGORY_MAP) {
    if (pattern.test(name)) return cat;
  }
  return '기타';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  try {
    const { week_start } = req.body ?? {};
    if (!week_start) return res.status(400).json({ error: 'week_start required' });

    const weekEnd = new Date(week_start);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Get all meals for the week
    const { data: meals, error: mErr } = await db.supabase
      .from('meal_plans')
      .select('menu_name')
      .eq('user_id', userId)
      .gte('plan_date', week_start)
      .lte('plan_date', weekEndStr)
      .not('menu_name', 'is', null);

    if (mErr) throw mErr;

    const menuNames = [...new Set(meals.map(m => m.menu_name))];
    if (menuNames.length === 0) return res.json({ items: [] });

    // Get recipes with ingredients + baby flag
    const { data: recipes, error: rErr } = await db.supabase
      .from('recipes')
      .select('name, ingredients, baby')
      .in('name', menuNames);

    if (rErr) throw rErr;

    // Count how many times each menu appears this week
    const menuCount = {};
    for (const m of meals) {
      menuCount[m.menu_name] = (menuCount[m.menu_name] ?? 0) + 1;
    }

    // Collect ingredients
    const ingMap = new Map(); // name → { qty, category, for_baby, menu_count }
    for (const recipe of recipes ?? []) {
      const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      for (const ing of ings) {
        const name = ing.name ?? '';
        if (!name) continue;
        if (ingMap.has(name)) {
          ingMap.get(name).menu_count += 1;
        } else {
          ingMap.set(name, {
            qty:        ing.qty ?? '',
            category:   categorize(name),
            for_baby:   recipe.baby ?? false,
            menu_count: menuCount[recipe.name] ?? 1,
          });
        }
      }
    }

    // Replace existing grocery for this week
    await db.supabase
      .from('grocery_items')
      .delete()
      .eq('user_id', userId)
      .eq('week_start', week_start);

    const rows = Array.from(ingMap.entries()).map(([name, info]) => ({
      user_id:    userId,
      week_start,
      name,
      qty:        info.qty,
      category:   info.category,
      for_baby:   info.for_baby,
      is_bought:  false,
      menu_count: info.menu_count,
    }));

    if (rows.length > 0) {
      const { error: iErr } = await db.supabase.from('grocery_items').insert(rows);
      if (iErr) throw iErr;
    }

    return res.json({ count: rows.length });
  } catch (err) {
    console.error('[grocery/generate]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
