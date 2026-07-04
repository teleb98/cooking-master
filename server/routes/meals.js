import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
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

function localDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMonday(weekOffset = 0) {
  const today = new Date();
  const dow = today.getDay(); // 로컬 요일 (0=일, 1=월, ...)
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff + weekOffset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toDateStr(d) { return localDateStr(d); }

async function seedDefaultPlan(userId, familyGroupId = null) {
  const monday = getMonday(0);
  const recipeRows = await db.getMany('SELECT name, kcal, baby FROM recipes');
  const recipeMap = Object.fromEntries(recipeRows.map(r => [r.name, r]));

  for (let day = 0; day < 14; day++) {
    const planDate = toDateStr(addDays(monday, day));
    for (let mt = 0; mt < 3; mt++) {
      const menuName = DEFAULT_PLAN[day][mt];
      if (!menuName) continue;
      const recipe = recipeMap[menuName] ?? {};
      const existing = await db.getOne(
        'SELECT id FROM meal_plans WHERE user_id = $1 AND plan_date = $2 AND meal_type = $3',
        [userId, planDate, MEAL_TYPES[mt]],
      );
      if (existing) continue;
      await db.run(
        `INSERT INTO meal_plans (id, user_id, plan_date, meal_type, menu_name, kcal, is_baby, family_group_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), userId, planDate, MEAL_TYPES[mt], menuName, recipe.kcal ?? null, recipe.baby ? 1 : 0, familyGroupId],
      );
    }
  }
}

async function getUserGroupStatus(userId) {
  const prof = await db.getOne('SELECT family_group_id FROM user_profiles WHERE user_id = $1', [userId]);
  const groupId = prof?.family_group_id ?? null;
  if (!groupId) return { groupId: null, isConnected: false };
  const member = await db.getOne(
    'SELECT status FROM family_members WHERE family_group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  return { groupId, isConnected: member?.status === 'active' };
}

function toMeal(row) {
  return { ...row, is_baby: !!row.is_baby };
}

// GET /api/meals?week_start=YYYY-MM-DD or ?start=...&end=...
router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const { week_start, start, end } = req.query;
    let rangeStart, rangeEnd;
    if (start && end) { rangeStart = start; rangeEnd = end; }
    else if (week_start) { rangeStart = week_start; rangeEnd = toDateStr(addDays(new Date(week_start), 6)); }
    else return res.status(400).json({ error: 'week_start or start+end required' });
    const weekEnd = rangeEnd;

    const { groupId, isConnected } = await getUserGroupStatus(userId);

    const userMeals = await db.getMany('SELECT id FROM meal_plans WHERE user_id = $1 LIMIT 1', [userId]);
    if (userMeals.length === 0) {
      if (isConnected && groupId) {
        const groupMeals = await db.getMany('SELECT id FROM meal_plans WHERE family_group_id = $1 LIMIT 1', [groupId]);
        if (groupMeals.length === 0) await seedDefaultPlan(userId, groupId);
      } else {
        await seedDefaultPlan(userId, null);
      }
    }

    let meals = [];
    if (isConnected && groupId) {
      const [groupRows, myUntagged] = await Promise.all([
        db.getMany(
          `SELECT * FROM meal_plans WHERE family_group_id = $1 AND plan_date >= $2 AND plan_date <= $3
           ORDER BY plan_date, meal_type`,
          [groupId, rangeStart, weekEnd],
        ),
        db.getMany(
          `SELECT * FROM meal_plans WHERE user_id = $1 AND family_group_id IS NULL AND plan_date >= $2 AND plan_date <= $3`,
          [userId, rangeStart, weekEnd],
        ),
      ]);
      const map = {};
      for (const m of myUntagged) map[`${m.plan_date}_${m.meal_type}`] = m;
      for (const m of groupRows) map[`${m.plan_date}_${m.meal_type}`] = m;
      meals = Object.values(map).sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.meal_type.localeCompare(b.meal_type));
    } else {
      meals = await db.getMany(
        `SELECT * FROM meal_plans WHERE user_id = $1 AND plan_date >= $2 AND plan_date <= $3
         ORDER BY plan_date, meal_type`,
        [userId, rangeStart, weekEnd],
      );
    }

    res.json({ meals: meals.map(toMeal), family_group_id: groupId, is_connected: isConnected });
  } catch (err) {
    console.error('[meals GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/meals — 슬롯 저장
router.put('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const { plan_date, meal_type, menu_name } = req.body ?? {};
    if (!plan_date || !meal_type) return res.status(400).json({ error: 'plan_date and meal_type required' });

    let kcal = null, isBaby = 0;
    if (menu_name) {
      const recipe = await db.getOne('SELECT kcal, baby FROM recipes WHERE name = $1', [menu_name]);
      if (recipe) { kcal = recipe.kcal; isBaby = recipe.baby ? 1 : 0; }
    }

    const { groupId, isConnected } = await getUserGroupStatus(userId);

    if (isConnected && groupId) {
      const existingMeal = await db.getOne(
        'SELECT id FROM meal_plans WHERE family_group_id = $1 AND plan_date = $2 AND meal_type = $3',
        [groupId, plan_date, meal_type],
      );
      if (existingMeal) {
        await db.run(
          'UPDATE meal_plans SET user_id = $1, menu_name = $2, kcal = $3, is_baby = $4 WHERE id = $5',
          [userId, menu_name ?? null, kcal, isBaby, existingMeal.id],
        );
      } else {
        await db.run(
          `INSERT INTO meal_plans (id, user_id, plan_date, meal_type, menu_name, kcal, is_baby, family_group_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [randomUUID(), userId, plan_date, meal_type, menu_name ?? null, kcal, isBaby, groupId],
        );
      }
    } else {
      const existing = await db.getOne(
        'SELECT id FROM meal_plans WHERE user_id = $1 AND plan_date = $2 AND meal_type = $3',
        [userId, plan_date, meal_type],
      );
      if (existing) {
        await db.run('UPDATE meal_plans SET menu_name = $1, kcal = $2, is_baby = $3 WHERE id = $4',
          [menu_name ?? null, kcal, isBaby, existing.id]);
      } else {
        await db.run(
          `INSERT INTO meal_plans (id, user_id, plan_date, meal_type, menu_name, kcal, is_baby)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), userId, plan_date, meal_type, menu_name ?? null, kcal, isBaby],
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[meals PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
