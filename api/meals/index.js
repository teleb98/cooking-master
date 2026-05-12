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
  const dow = today.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setUTCDate(today.getUTCDate() + diff + weekOffset * 7);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function seedDefaultPlan(userId, familyGroupId = null) {
  const monday = getMonday(0);
  const { data: recipeRows } = await db.supabase.from('recipes').select('name, kcal, baby');
  const recipeMap = Object.fromEntries((recipeRows ?? []).map(r => [r.name, r]));

  const rows = [];
  for (let day = 0; day < 14; day++) {
    const planDate = toDateStr(addDays(monday, day));
    for (let mt = 0; mt < 3; mt++) {
      const menuName = DEFAULT_PLAN[day][mt];
      if (!menuName) continue;
      const recipe = recipeMap[menuName] ?? {};
      rows.push({
        user_id:         userId,
        plan_date:       planDate,
        meal_type:       MEAL_TYPES[mt],
        menu_name:       menuName,
        kcal:            recipe.kcal ?? null,
        is_baby:         recipe.baby ?? false,
        family_group_id: familyGroupId,
      });
    }
  }
  await db.supabase.from('meal_plans').upsert(rows, { onConflict: 'user_id,plan_date,meal_type' });
}

async function getUserGroupStatus(userId) {
  const { data: prof } = await db.supabase
    .from('user_profiles').select('family_group_id').eq('user_id', userId).maybeSingle();
  const groupId = prof?.family_group_id ?? null;
  if (!groupId) return { groupId: null, isConnected: false };

  const { data: member } = await db.supabase
    .from('family_members').select('status').eq('family_group_id', groupId).eq('user_id', userId).maybeSingle();
  return { groupId, isConnected: member?.status === 'active' };
}

export default async function handler(req, res) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  try {
    // ── GET /api/meals?week_start=YYYY-MM-DD  또는  ?start=…&end=… ──
    if (req.method === 'GET') {
      const { week_start, start, end } = req.query;
      let rangeStart, rangeEnd;
      if (start && end) {
        rangeStart = start; rangeEnd = end;
      } else if (week_start) {
        rangeStart = week_start; rangeEnd = toDateStr(addDays(new Date(week_start), 6));
      } else {
        return res.status(400).json({ error: 'week_start or start+end required' });
      }
      const weekEnd = rangeEnd;

      const { groupId, isConnected } = await getUserGroupStatus(userId);

      // 시드 필요 여부 확인
      const { data: userMeals } = await db.supabase
        .from('meal_plans').select('id').eq('user_id', userId).limit(1);

      if (!userMeals || userMeals.length === 0) {
        if (isConnected && groupId) {
          // 가족 식단이 이미 있는지 확인 (파트너가 이미 식단 가짐)
          const { data: groupMeals } = await db.supabase
            .from('meal_plans').select('id').eq('family_group_id', groupId).limit(1);
          if (!groupMeals || groupMeals.length === 0) {
            await seedDefaultPlan(userId, groupId);
          }
          // 파트너 식단이 있으면 시드 안 함 (공유 식단 사용)
        } else {
          await seedDefaultPlan(userId, null);
        }
      }

      // 식단 조회: 연결된 경우 가족 그룹 식단 + 아직 태그 안 된 내 식단
      let meals = [];
      if (isConnected && groupId) {
        const [{ data: groupRows }, { data: myUntagged }] = await Promise.all([
          db.supabase.from('meal_plans').select('*')
            .eq('family_group_id', groupId)
            .gte('plan_date', rangeStart).lte('plan_date', weekEnd)
            .order('plan_date').order('meal_type'),
          db.supabase.from('meal_plans').select('*')
            .eq('user_id', userId).is('family_group_id', null)
            .gte('plan_date', rangeStart).lte('plan_date', weekEnd),
        ]);
        // 병합 (그룹 식단 우선)
        const map = {};
        for (const m of (myUntagged ?? [])) map[`${m.plan_date}_${m.meal_type}`] = m;
        for (const m of (groupRows ?? [])) map[`${m.plan_date}_${m.meal_type}`] = m;
        meals = Object.values(map).sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.meal_type.localeCompare(b.meal_type));
      } else {
        const { data, error } = await db.supabase.from('meal_plans').select('*')
          .eq('user_id', userId)
          .gte('plan_date', rangeStart).lte('plan_date', weekEnd)
          .order('plan_date').order('meal_type');
        if (error) throw error;
        meals = data ?? [];
      }

      return res.json({ meals, family_group_id: groupId, is_connected: isConnected });
    }

    // ── PUT /api/meals — 슬롯 저장 ───────────────────────────
    if (req.method === 'PUT') {
      const { plan_date, meal_type, menu_name } = req.body ?? {};
      if (!plan_date || !meal_type) return res.status(400).json({ error: 'plan_date and meal_type required' });

      let kcal = null, is_baby = false;
      if (menu_name) {
        const { data: recipe } = await db.supabase.from('recipes')
          .select('kcal, baby').eq('name', menu_name).maybeSingle();
        if (recipe) { kcal = recipe.kcal; is_baby = recipe.baby; }
      }

      const { groupId, isConnected } = await getUserGroupStatus(userId);

      if (isConnected && groupId) {
        // 공유 식단: family_group_id + date + type 기준으로 찾아서 update or insert
        const { data: existingMeal } = await db.supabase.from('meal_plans').select('id')
          .eq('family_group_id', groupId).eq('plan_date', plan_date).eq('meal_type', meal_type).maybeSingle();

        if (existingMeal) {
          const { error } = await db.supabase.from('meal_plans')
            .update({ user_id: userId, menu_name: menu_name ?? null, kcal, is_baby })
            .eq('id', existingMeal.id);
          if (error) throw error;
        } else {
          const { error } = await db.supabase.from('meal_plans')
            .insert({ user_id: userId, plan_date, meal_type, menu_name: menu_name ?? null, kcal, is_baby, family_group_id: groupId });
          if (error) throw error;
        }
      } else {
        const { error } = await db.supabase.from('meal_plans').upsert(
          { user_id: userId, plan_date, meal_type, menu_name: menu_name ?? null, kcal, is_baby },
          { onConflict: 'user_id,plan_date,meal_type' },
        );
        if (error) throw error;
      }

      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[meals]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
