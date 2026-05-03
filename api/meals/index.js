import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

const DEFAULT_PLAN = [
  ['오트밀 죽',      '닭가슴살 샐러드', '두부조림 백반'],
  ['아보카도 토스트', '비빔밥',         '제육볶음'],
  ['그릭 요거트 볼',  '두부면 파스타',   '소고기 미역국'],
  ['오트밀 죽',      '계란 토마토 볶음', '연어구이 정식'],
  ['아보카도 토스트', '잡채',           null],
  ['그릭 요거트 볼',  '닭곰탕',         '김치찌개'],
  ['오트밀 죽',      '비빔밥',         '갈비찜'],
  ['아보카도 토스트', '두부면 파스타',   '시금치 된장국'],
  ['오트밀 죽',      '계란 토마토 볶음', '버섯 리조또'],
  ['그릭 요거트 볼',  '닭가슴살 샐러드', '제육볶음'],
  ['오트밀 죽',      '비빔밥',         '고등어구이'],
  ['아보카도 토스트', '단호박 수프',     '소고기 미역국'],
  ['그릭 요거트 볼',  '잡채',           '연어구이 정식'],
  ['오트밀 죽',      '닭곰탕',         '갈비찜'],
];

function getMonday(weekOffset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff + weekOffset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function seedDefaultPlan(userId) {
  const monday = getMonday(0);

  // Get all recipe kcal/baby info in one query
  const { data: recipeRows } = await db.supabase
    .from('recipes')
    .select('name, kcal, baby');
  const recipeMap = Object.fromEntries((recipeRows ?? []).map(r => [r.name, r]));

  const rows = [];
  for (let day = 0; day < 14; day++) {
    const planDate = toDateStr(addDays(monday, day));
    for (let mt = 0; mt < 3; mt++) {
      const menuName = DEFAULT_PLAN[day][mt];
      if (!menuName) continue;
      const recipe = recipeMap[menuName] ?? {};
      rows.push({
        user_id:   userId,
        plan_date: planDate,
        meal_type: MEAL_TYPES[mt],
        menu_name: menuName,
        kcal:      recipe.kcal ?? null,
        is_baby:   recipe.baby ?? false,
      });
    }
  }

  await db.supabase
    .from('meal_plans')
    .upsert(rows, { onConflict: 'user_id,plan_date,meal_type' });
}

export default async function handler(req, res) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  try {
    // GET /api/meals?week_start=YYYY-MM-DD
    if (req.method === 'GET') {
      const { week_start } = req.query;
      if (!week_start) return res.status(400).json({ error: 'week_start required' });

      const weekEnd = toDateStr(addDays(new Date(week_start), 6));

      // First-time seed: check if user has ANY meals
      const { data: existing } = await db.supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (!existing || existing.length === 0) {
        await seedDefaultPlan(userId);
      }

      const { data, error } = await db.supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', userId)
        .gte('plan_date', week_start)
        .lte('plan_date', weekEnd)
        .order('plan_date')
        .order('meal_type');

      if (error) throw error;
      return res.json({ meals: data ?? [] });
    }

    // PUT /api/meals — upsert one slot
    if (req.method === 'PUT') {
      const { plan_date, meal_type, menu_name } = req.body ?? {};
      if (!plan_date || !meal_type) {
        return res.status(400).json({ error: 'plan_date and meal_type required' });
      }

      let kcal = null;
      let is_baby = false;
      if (menu_name) {
        const { data: recipe } = await db.supabase
          .from('recipes')
          .select('kcal, baby')
          .eq('name', menu_name)
          .maybeSingle();
        if (recipe) { kcal = recipe.kcal; is_baby = recipe.baby; }
      }

      const { error } = await db.supabase
        .from('meal_plans')
        .upsert(
          { user_id: userId, plan_date, meal_type, menu_name: menu_name ?? null, kcal, is_baby },
          { onConflict: 'user_id,plan_date,meal_type' },
        );

      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[meals]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
