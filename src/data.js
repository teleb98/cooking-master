
export const FOOD_CHIPS = [
  '소고기', '돼지고기', '닭고기', '오리고기',
  '연어', '고등어', '새우', '오징어', '조개',
  '두부', '달걀', '치즈',
  '시금치', '브로콜리', '버섯', '당근', '양배추', '파프리카',
  '된장·간장 베이스', '매운 음식', '국·찌개', '볶음 요리',
];

export const ALLERGY_CHIPS = [
  '땅콩', '갑각류', '유제품', '밀·글루텐',
  '달걀', '견과류', '생선·해산물', '대두·콩',
];

export const TODAY_INDEX = 2; // 0=Mon…6=Sun
export const TODAY_DATE = 6;  // May 6

export const DAYS_KR = ['월', '화', '수', '목', '금', '토', '일'];
export const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const FAMILY_REF_BASE = 4; // Mon = May 4

export const MEAL_LIB = {
  '두부조림 백반':    { kcal: 540, ing: ['두부 2모', '간장 3T', '대파 1대', '마늘 5쪽'], baby: false },
  '닭가슴살 샐러드':  { kcal: 380, ing: ['닭가슴살 200g', '양상추 1/2통', '방울토마토 10개', '올리브오일 2T'], baby: false },
  '소고기 미역국':    { kcal: 460, ing: ['소고기 200g', '미역 30g', '국간장 2T', '참기름 1T'], baby: true, babyNote: '미역 부드럽게 다지기, 간 X' },
  '제육볶음':        { kcal: 620, ing: ['돼지고기 300g', '고추장 3T', '양파 1개', '대파 1대'], baby: false },
  '연어구이 정식':    { kcal: 580, ing: ['연어 200g', '레몬 1/2개', '아스파라거스 6대', '버터 20g'], baby: true, babyNote: '연어 30g 으깨서 죽에' },
  '김치찌개':        { kcal: 510, ing: ['묵은지 200g', '돼지고기 150g', '두부 1모', '대파 1대'], baby: false },
  '계란 토마토 볶음':  { kcal: 320, ing: ['달걀 3개', '토마토 2개', '대파 1대'], baby: true, babyNote: '노른자만, 토마토 으깨서' },
  '시금치 된장국':    { kcal: 220, ing: ['시금치 1단', '된장 2T', '바지락 200g'], baby: true, babyNote: '시금치 잎만, 바지락 X' },
  '버섯 리조또':      { kcal: 480, ing: ['표고 5개', '쌀 1.5컵', '파마산 30g', '버터 15g'], baby: false },
  '오이냉국':        { kcal: 80,  ing: ['오이 2개', '식초 2T', '국간장 1T'], baby: false },
  '고등어구이':       { kcal: 420, ing: ['고등어 1마리', '소금 약간', '레몬 1/2개'], baby: false },
  '잡채':           { kcal: 460, ing: ['당면 200g', '소고기 150g', '시금치 1단', '당근 1개'], baby: false },
  '그릭 요거트 볼':   { kcal: 280, ing: ['그릭요거트 200g', '블루베리 50g', '꿀 1T', '그래놀라 30g'], baby: false },
  '닭곰탕':         { kcal: 410, ing: ['닭 1/2마리', '대파 2대', '마늘 통째', '소금'], baby: true, babyNote: '닭 살코기 잘게 찢어 죽에' },
  '비빔밥':         { kcal: 590, ing: ['시금치', '콩나물', '소고기 100g', '계란 1개', '고추장 2T'], baby: false },
  '두부면 파스타':    { kcal: 350, ing: ['두부면 200g', '방울토마토 10개', '바질', '올리브오일 2T'], baby: false },
  '갈비찜':         { kcal: 720, ing: ['소갈비 500g', '무 1/4개', '당근 1개', '간장 4T'], baby: true, babyNote: '갈빗살 30g 잘게 찢어' },
  '단호박 수프':      { kcal: 240, ing: ['단호박 1/2개', '우유 200ml', '버터 10g'], baby: true, babyNote: '단호박 으깨서 그대로' },
  '오트밀 죽':       { kcal: 290, ing: ['오트밀 60g', '우유 200ml', '바나나 1개'], baby: false },
  '아보카도 토스트':  { kcal: 360, ing: ['식빵 2장', '아보카도 1개', '계란 2개'], baby: false },
};

export const MEAL_TYPES = [
  { key: 'breakfast', kr: '아침', en: 'B' },
  { key: 'lunch',     kr: '점심', en: 'L' },
  { key: 'dinner',    kr: '저녁', en: 'D' },
];

export const PLAN = [
  // Week 1
  ['오트밀 죽',        '닭가슴살 샐러드', '두부조림 백반'],
  ['아보카도 토스트',   '비빔밥',         '제육볶음'],
  ['그릭 요거트 볼',    '두부면 파스타',   '소고기 미역국'],  // today (Wed)
  ['오트밀 죽',        '계란 토마토 볶음', '연어구이 정식'],
  ['아보카도 토스트',   '잡채',           null],
  ['그릭 요거트 볼',    '닭곰탕',         '김치찌개'],
  ['오트밀 죽',        '비빔밥',         '갈비찜'],
  // Week 2
  ['아보카도 토스트',   '두부면 파스타',   '시금치 된장국'],
  ['오트밀 죽',        '계란 토마토 볶음', '버섯 리조또'],
  ['그릭 요거트 볼',    '닭가슴살 샐러드', '제육볶음'],
  ['오트밀 죽',        '비빔밥',         '고등어구이'],
  ['아보카도 토스트',   '단호박 수프',     '소고기 미역국'],
  ['그릭 요거트 볼',    '잡채',           '연어구이 정식'],
  ['오트밀 죽',        '닭곰탕',         '갈비찜'],
];

export const GROCERY = [
  { cat: '육류',   cat_en: 'Meat',      items: [
    { name: '소고기',     name_en: 'Beef',           qty: '700g',  forBaby: true,  menus: 2, bought: false },
    { name: '돼지고기',   name_en: 'Pork',           qty: '450g',  forBaby: false, menus: 2, bought: false },
    { name: '닭가슴살',   name_en: 'Chicken breast', qty: '400g',  forBaby: false, menus: 2, bought: true  },
    { name: '연어',      name_en: 'Salmon',          qty: '230g',  forBaby: true,  menus: 1, bought: false },
  ]},
  { cat: '채소',   cat_en: 'Vegetables', items: [
    { name: '양파',      name_en: 'Onion',           qty: '4개',   forBaby: false, menus: 3, bought: true  },
    { name: '대파',      name_en: 'Green onion',     qty: '5대',   forBaby: false, menus: 6, bought: false },
    { name: '시금치',    name_en: 'Spinach',         qty: '2단',   forBaby: true,  menus: 2, bought: false },
    { name: '아스파라거스', name_en: 'Asparagus',    qty: '6대',   forBaby: false, menus: 1, bought: false },
    { name: '방울토마토',  name_en: 'Cherry tomato', qty: '20개',  forBaby: false, menus: 2, bought: false },
  ]},
  { cat: '유제품', cat_en: 'Dairy',      items: [
    { name: '두부',      name_en: 'Tofu',            qty: '3모',   forBaby: false, menus: 2, bought: false },
    { name: '우유',      name_en: 'Milk',            qty: '500ml', forBaby: true,  menus: 2, bought: true  },
    { name: '그릭요거트', name_en: 'Greek yogurt',    qty: '600g',  forBaby: false, menus: 3, bought: false },
    { name: '버터',      name_en: 'Butter',          qty: '50g',   forBaby: false, menus: 2, bought: false },
  ]},
  { cat: '곡물·기타', cat_en: 'Grains',  items: [
    { name: '오트밀',    name_en: 'Oatmeal',         qty: '300g',  forBaby: false, menus: 4, bought: false },
    { name: '식빵',      name_en: 'Bread',           qty: '1봉',   forBaby: false, menus: 2, bought: true  },
    { name: '미역',      name_en: 'Seaweed',         qty: '60g',   forBaby: true,  menus: 1, bought: false },
  ]},
];
