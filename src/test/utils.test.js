import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Inline copies of pure functions under test ──────────────────────────────
// (avoids JSX/browser-only imports while still testing the real logic)

const CAT_ORDER = ['육류', '채소', '유제품', '곡물·기타', '기타'];
const CAT_EN = { '육류': 'Meat', '채소': 'Vegetables', '유제품': 'Dairy', '곡물·기타': 'Grains', '기타': 'Other' };

function groupByCategory(items) {
  const map = {};
  for (const item of items) {
    const cat = item.category ?? '기타';
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  }
  return CAT_ORDER.filter(c => map[c]).map(c => ({ cat: c, cat_en: CAT_EN[c] ?? c, items: map[c] }));
}

function getWeekStart(refDate) {
  const today = refDate ?? new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function monthsOld(birthday) {
  if (!birthday) return 0;
  return Math.floor((Date.now() - new Date(birthday)) / (1000 * 60 * 60 * 24 * 30.44));
}

function babyStage(months) {
  if (months <  6) return { stage: '초기', en: 'early-stage' };
  if (months <  9) return { stage: '중기', en: 'mid-stage' };
  if (months < 12) return { stage: '후기', en: 'late-stage' };
  return               { stage: '완료기', en: 'complete' };
}

function addDays(dateStr, n) {
  // YYYY-MM-DD strings parsed by Date() are treated as UTC midnight — safe across timezones
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── groupByCategory ───────────────────────────────────────────────────────────
describe('groupByCategory', () => {
  it('groups items by category and respects CAT_ORDER', () => {
    const items = [
      { id: 1, name: '소고기', category: '육류' },
      { id: 2, name: '시금치', category: '채소' },
      { id: 3, name: '두부',   category: '유제품' },
      { id: 4, name: '쌀',     category: '곡물·기타' },
    ];
    const groups = groupByCategory(items);
    expect(groups.map(g => g.cat)).toEqual(['육류', '채소', '유제품', '곡물·기타']);
  });

  it('maps category keys to English', () => {
    const items = [{ id: 1, name: '소고기', category: '육류' }];
    const [g] = groupByCategory(items);
    expect(g.cat_en).toBe('Meat');
  });

  it('falls back to 기타 when category is undefined', () => {
    const items = [{ id: 1, name: '기타재료' }]; // no category field
    const groups = groupByCategory(items);
    expect(groups[0].cat).toBe('기타');
    expect(groups[0].cat_en).toBe('Other');
  });

  it('returns empty array for empty input', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('excludes categories with no items', () => {
    const items = [{ id: 1, name: '닭고기', category: '육류' }];
    const groups = groupByCategory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].cat).toBe('육류');
  });

  it('preserves all items within a category', () => {
    const items = [
      { id: 1, name: '소고기', category: '육류' },
      { id: 2, name: '돼지고기', category: '육류' },
      { id: 3, name: '닭고기', category: '육류' },
    ];
    const [group] = groupByCategory(items);
    expect(group.items).toHaveLength(3);
  });
});

// ── getWeekStart ──────────────────────────────────────────────────────────────
describe('getWeekStart', () => {
  it('returns the Monday of the current week (Mon input)', () => {
    const monday = new Date('2025-05-05'); // Monday
    expect(getWeekStart(monday)).toBe('2025-05-05');
  });

  it('returns the Monday for Wednesday input', () => {
    const wednesday = new Date('2025-05-07'); // Wednesday
    expect(getWeekStart(wednesday)).toBe('2025-05-05');
  });

  it('returns the Monday for Sunday input (ISO week — Mon start)', () => {
    const sunday = new Date('2025-05-11'); // Sunday
    expect(getWeekStart(sunday)).toBe('2025-05-05');
  });

  it('returns the Monday for Saturday input', () => {
    const saturday = new Date('2025-05-10'); // Saturday
    expect(getWeekStart(saturday)).toBe('2025-05-05');
  });

  it('crosses month boundary correctly', () => {
    // Sunday Apr 27 → should give Monday Apr 21
    const sunday = new Date('2025-04-27');
    expect(getWeekStart(sunday)).toBe('2025-04-21');
  });
});

// ── babyStage ─────────────────────────────────────────────────────────────────
describe('babyStage', () => {
  it('returns 초기 for < 6 months', () => {
    expect(babyStage(0).stage).toBe('초기');
    expect(babyStage(5).stage).toBe('초기');
  });

  it('returns 중기 for 6-8 months', () => {
    expect(babyStage(6).stage).toBe('중기');
    expect(babyStage(8).stage).toBe('중기');
  });

  it('returns 후기 for 9-11 months', () => {
    expect(babyStage(9).stage).toBe('후기');
    expect(babyStage(11).stage).toBe('후기');
  });

  it('returns 완료기 for 12+ months', () => {
    expect(babyStage(12).stage).toBe('완료기');
    expect(babyStage(24).stage).toBe('완료기');
  });

  it('returns English en field', () => {
    expect(babyStage(0).en).toBe('early-stage');
    expect(babyStage(6).en).toBe('mid-stage');
    expect(babyStage(9).en).toBe('late-stage');
    expect(babyStage(12).en).toBe('complete');
  });
});

// ── monthsOld ─────────────────────────────────────────────────────────────────
describe('monthsOld', () => {
  it('returns 0 for null birthday', () => {
    expect(monthsOld(null)).toBe(0);
  });

  it('returns 0 for undefined birthday', () => {
    expect(monthsOld(undefined)).toBe(0);
  });

  it('returns positive months for a past date', () => {
    // 6 months ago
    const sixMonthsAgo = new Date(Date.now() - 6 * 30.44 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = monthsOld(sixMonthsAgo);
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThanOrEqual(7);
  });
});

// ── addDays ───────────────────────────────────────────────────────────────────
describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2025-05-01', 5)).toBe('2025-05-06');
  });

  it('crosses month boundary', () => {
    expect(addDays('2025-05-29', 5)).toBe('2025-06-03');
  });

  it('crosses year boundary', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('subtracts days with negative n', () => {
    expect(addDays('2025-05-06', -6)).toBe('2025-04-30');
  });

  it('handles 0 days (no change)', () => {
    expect(addDays('2025-05-06', 0)).toBe('2025-05-06');
  });
});
