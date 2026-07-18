import { describe, it, expect } from 'vitest';
import { computeGroceryRecommendations, topMenuNames } from '../../../server/routes/grocery.js';

describe('topMenuNames', () => {
  it('menu_name 빈도 내림차순으로 상위 N개를 반환한다', () => {
    const meals = [
      { menu_name: 'A' }, { menu_name: 'A' }, { menu_name: 'A' },
      { menu_name: 'B' }, { menu_name: 'B' },
      { menu_name: 'C' },
    ];
    expect(topMenuNames(meals, 2)).toEqual(['A', 'B']);
  });

  it('menu_name 이 null 인 행은 무시한다', () => {
    expect(topMenuNames([{ menu_name: null }, { menu_name: 'A' }], 5)).toEqual(['A']);
  });

  it('빈 배열이면 빈 배열 반환', () => {
    expect(topMenuNames([])).toEqual([]);
  });
});

describe('computeGroceryRecommendations', () => {
  const noStock = new Set();
  const noList = new Set();

  it('구매 이력·메뉴 근거 모두 없으면 빈 배열', () => {
    expect(computeGroceryRecommendations([], [], [], noStock, noList)).toEqual([]);
  });

  it('구매 횟수가 최소치(2) 이상이면 추천에 포함(purchase)', () => {
    const purchases = [
      { name: '양파', category: '채소' },
      { name: '양파', category: '채소' },
    ];
    const recs = computeGroceryRecommendations(purchases, [], [], noStock, noList);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ name: '양파', category: '채소', reason: 'purchase' });
  });

  it('구매 횟수가 1회뿐이고 메뉴 근거도 없으면 제외한다(신호 약함)', () => {
    const purchases = [{ name: '희귀재료', category: '기타' }];
    expect(computeGroceryRecommendations(purchases, [], [], noStock, noList)).toEqual([]);
  });

  it('구매는 1회뿐이어도 자주 등장하는 메뉴의 재료면 포함한다(menu)', () => {
    const purchases = [{ name: '두부', category: '곡물·기타' }];
    const meals = [{ menu_name: '두부조림' }, { menu_name: '두부조림' }];
    const recipes = [{ name: '두부조림', ingredients: JSON.stringify([{ name: '두부', qty: '1모' }]) }];
    const recs = computeGroceryRecommendations(purchases, meals, recipes, noStock, noList);
    expect(recs[0]).toMatchObject({ name: '두부', reason: 'both', qty: '1모' });
  });

  it('메뉴에만 등장하고 구매 이력이 전혀 없어도 포함한다(menu)', () => {
    const meals = [{ menu_name: '김치찌개' }];
    const recipes = [{ name: '김치찌개', ingredients: JSON.stringify([{ name: '돼지고기', qty: '150g' }]) }];
    const recs = computeGroceryRecommendations([], meals, recipes, noStock, noList);
    expect(recs[0]).toMatchObject({ name: '돼지고기', reason: 'menu', qty: '150g' });
  });

  it('현재 재고(미소비)에 있는 재료는 제외한다', () => {
    const purchases = [{ name: '양파', category: '채소' }, { name: '양파', category: '채소' }];
    const inStock = new Set(['양파']);
    expect(computeGroceryRecommendations(purchases, [], [], inStock, noList)).toEqual([]);
  });

  it('이번 주 장보기 목록에 이미 있는 재료는 제외한다', () => {
    const purchases = [{ name: '당근', category: '채소' }, { name: '당근', category: '채소' }];
    const inList = new Set(['당근']);
    expect(computeGroceryRecommendations(purchases, [], [], noStock, inList)).toEqual([]);
  });

  it('제외 대소문자 무관 매칭(재고/목록 이름은 소문자로 비교)', () => {
    const purchases = [{ name: 'Milk', category: '유제품' }, { name: 'Milk', category: '유제품' }];
    const inStock = new Set(['milk']);
    expect(computeGroceryRecommendations(purchases, [], [], inStock, noList)).toEqual([]);
  });

  it('점수 내림차순 정렬 — 구매+메뉴 둘 다 근거 있는 항목이 상위', () => {
    const purchases = [
      { name: '단독구매', category: '기타' }, { name: '단독구매', category: '기타' },
      { name: '둘다', category: '기타' }, { name: '둘다', category: '기타' },
    ];
    const meals = [{ menu_name: 'X' }];
    const recipes = [{ name: 'X', ingredients: JSON.stringify([{ name: '둘다', qty: '1개' }]) }];
    const recs = computeGroceryRecommendations(purchases, meals, recipes, noStock, noList);
    expect(recs[0].name).toBe('둘다');
    expect(recs[0].reason).toBe('both');
  });

  it('최대 12개까지만 반환한다(MAX_RECOMMENDATIONS)', () => {
    const purchases = Array.from({ length: 20 }, (_, i) => [
      { name: `재료${i}`, category: '기타' },
      { name: `재료${i}`, category: '기타' },
    ]).flat();
    const recs = computeGroceryRecommendations(purchases, [], [], noStock, noList);
    expect(recs.length).toBeLessThanOrEqual(12);
  });

  it('카테고리 정보가 없는 메뉴 전용 재료는 categorize() 로 자동 분류한다', () => {
    const meals = [{ menu_name: 'Y' }];
    const recipes = [{ name: 'Y', ingredients: JSON.stringify([{ name: '소고기', qty: '200g' }]) }];
    const recs = computeGroceryRecommendations([], meals, recipes, noStock, noList);
    expect(recs[0].category).toBe('육류');
  });
});
