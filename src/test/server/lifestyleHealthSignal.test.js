import { describe, it, expect } from 'vitest';
import { computeHealthSignal, HEALTH_TAGS } from '../../../server/routes/lifestyle.js';

describe('computeHealthSignal', () => {
  it('계획된 식단이 없으면 none/0', () => {
    expect(computeHealthSignal([], new Map())).toEqual({ score: 0, label: 'none', evidence: [], mealCount: 0 });
  });

  it('menu_name 없는 행은 분모에서 제외한다', () => {
    const meals = [{ menu_name: null }, { menu_name: '샐러드메뉴' }];
    const tagMap = new Map([['샐러드메뉴', ['샐러드']]]);
    const res = computeHealthSignal(meals, tagMap);
    expect(res.mealCount).toBe(1);
    expect(res.score).toBe(100);
  });

  it('건강 태그 비중에 따라 score/label을 계산한다', () => {
    const meals = [
      { menu_name: 'A' }, { menu_name: 'A' }, // 건강식
      { menu_name: 'B' }, { menu_name: 'B' }, { menu_name: 'B' }, // 일반
    ];
    const tagMap = new Map([['A', ['건강식']], ['B', ['한식', '찌개']]]);
    const res = computeHealthSignal(meals, tagMap);
    expect(res.score).toBe(40); // 2/5
    expect(res.label).toBe('high');
    expect(res.evidence).toContain('A');
  });

  it('건강 태그 메뉴가 전혀 없으면 label=none, score=0', () => {
    const meals = [{ menu_name: 'B' }, { menu_name: 'B' }];
    const tagMap = new Map([['B', ['한식']]]);
    const res = computeHealthSignal(meals, tagMap);
    expect(res).toMatchObject({ score: 0, label: 'none' });
  });

  it('label 경계값 — medium(15~39), low(1~14)', () => {
    // 20% → medium
    const medium = computeHealthSignal(
      Array.from({ length: 5 }, (_, i) => ({ menu_name: i === 0 ? 'H' : `N${i}` })),
      new Map([['H', ['다이어트']]]),
    );
    expect(medium.label).toBe('medium');

    // 1/20 = 5% → low
    const low = computeHealthSignal(
      Array.from({ length: 20 }, (_, i) => ({ menu_name: i === 0 ? 'H' : `N${i}` })),
      new Map([['H', ['보양']]]),
    );
    expect(low.label).toBe('low');
  });

  it('evidence 는 등장 빈도순 상위 5개까지만 반환한다', () => {
    const tagMap = new Map();
    const meals = [];
    for (let i = 0; i < 8; i++) {
      const name = `건강메뉴${i}`;
      tagMap.set(name, ['샐러드']);
      meals.push({ menu_name: name });
    }
    const res = computeHealthSignal(meals, tagMap);
    expect(res.evidence).toHaveLength(5);
  });

  it('HEALTH_TAGS 는 실제 시드 레시피 태그와 일치해야 한다', () => {
    expect(HEALTH_TAGS).toEqual(['건강식', '다이어트', '샐러드', '보양']);
  });
});
