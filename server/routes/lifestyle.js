import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// 건강 지향 신호의 근거로 삼는 레시피 태그 — server/db.js DEFAULT_RECIPES 에 이미 존재하는 태그들
export const HEALTH_TAGS = ['건강식', '다이어트', '샐러드', '보양'];
export const LOOKBACK_DAYS = 90;

/**
 * 최근 계획된 식단 중 건강 관련 태그 메뉴의 비중으로 "건강 지향" 신호를 계산한다(순수 함수 — 테스트 용이).
 * rarebook 패밀리(서점·서재)의 라이프스타일 인사이트가 이 신호를 함께 참고한다.
 * @param {Array<{menu_name:string}>} mealRows           최근 기간 meal_plans
 * @param {Map<string, string[]>} recipeTagMap           menu_name -> tags
 */
export function computeHealthSignal(mealRows, recipeTagMap) {
  const withMenu = mealRows.filter(m => m.menu_name);
  const total = withMenu.length;
  if (total === 0) return { score: 0, label: 'none', evidence: [], mealCount: 0 };

  const healthMenuCount = new Map();
  let healthCount = 0;
  for (const m of withMenu) {
    const tags = recipeTagMap.get(m.menu_name) || [];
    if (tags.some(t => HEALTH_TAGS.includes(t))) {
      healthCount += 1;
      healthMenuCount.set(m.menu_name, (healthMenuCount.get(m.menu_name) || 0) + 1);
    }
  }

  const score = Math.round((healthCount / total) * 100);
  const label = score >= 40 ? 'high' : score >= 15 ? 'medium' : score > 0 ? 'low' : 'none';
  const evidence = [...healthMenuCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return { score, label, evidence, mealCount: total };
}

/** userId 의 건강 지향 신호를 DB 에서 계산한다(라우트/다른 라우트에서 재사용). */
export async function getHealthSignalForUser(userId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const mealRows = await db.getMany(
    `SELECT menu_name FROM meal_plans WHERE user_id = $1 AND plan_date >= $2 AND menu_name IS NOT NULL`,
    [userId, cutoffStr],
  );
  const menuNames = [...new Set(mealRows.map(m => m.menu_name))];
  let recipeRows = [];
  if (menuNames.length) {
    const placeholders = menuNames.map((_, i) => `$${i + 1}`).join(',');
    recipeRows = await db.getMany(`SELECT name, tags FROM recipes WHERE name IN (${placeholders})`, menuNames);
  }
  const recipeTagMap = new Map(recipeRows.map(r => [r.name, JSON.parse(r.tags || '[]')]));
  return computeHealthSignal(mealRows, recipeTagMap);
}

// GET /api/lifestyle/health-signal — 최근 식단의 건강 지향 신호(서재/서점이 교차 조회)
router.get('/health-signal', requireAuth, async (req, res) => {
  try {
    const result = await getHealthSignalForUser(req.userId);
    res.json(result);
  } catch (err) {
    console.error('[lifestyle health-signal]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
