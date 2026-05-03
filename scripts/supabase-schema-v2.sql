-- Cooking Master — Schema v2
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run

-- ── Recipes (공통 레시피 라이브러리) ────────────────────────────
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kcal        integer default 0,
  ingredients jsonb default '[]',
  baby        boolean default false,
  baby_note   text,
  tags        text[] default '{}'
);

-- ── Meal Plans (사용자별 식단) ──────────────────────────────────
create table if not exists public.meal_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  plan_date   date not null,
  meal_type   text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  menu_name   text,
  kcal        integer,
  is_baby     boolean default false,
  created_at  timestamptz default now(),
  unique (user_id, plan_date, meal_type)
);

-- ── Grocery Items (사용자별 장보기 목록) ────────────────────────
create table if not exists public.grocery_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  week_start  date not null,
  name        text not null,
  qty         text default '',
  category    text default '기타',
  for_baby    boolean default false,
  is_bought   boolean default false,
  menu_count  integer default 1,
  created_at  timestamptz default now()
);

-- ── RLS 비활성화 ────────────────────────────────────────────────
alter table public.recipes       disable row level security;
alter table public.meal_plans    disable row level security;
alter table public.grocery_items disable row level security;

-- ── anon 역할 권한 부여 ─────────────────────────────────────────
grant select, insert, update, delete on public.recipes       to anon;
grant select, insert, update, delete on public.meal_plans    to anon;
grant select, insert, update, delete on public.grocery_items to anon;

-- ── 레시피 시드 데이터 ──────────────────────────────────────────
insert into public.recipes (name, kcal, ingredients, baby, baby_note, tags) values
  ('두부조림 백반', 540,
   '[{"name":"두부","qty":"2모"},{"name":"간장","qty":"3T"},{"name":"대파","qty":"1대"},{"name":"마늘","qty":"5쪽"}]',
   false, null, '{"한식","반찬"}'),

  ('닭가슴살 샐러드', 380,
   '[{"name":"닭가슴살","qty":"200g"},{"name":"양상추","qty":"1/2통"},{"name":"방울토마토","qty":"10개"},{"name":"올리브오일","qty":"2T"}]',
   false, null, '{"샐러드","건강식"}'),

  ('소고기 미역국', 460,
   '[{"name":"소고기","qty":"200g"},{"name":"미역","qty":"30g"},{"name":"국간장","qty":"2T"},{"name":"참기름","qty":"1T"}]',
   true, '미역 부드럽게 다지기, 간 X', '{"한식","국"}'),

  ('제육볶음', 620,
   '[{"name":"돼지고기","qty":"300g"},{"name":"고추장","qty":"3T"},{"name":"양파","qty":"1개"},{"name":"대파","qty":"1대"}]',
   false, null, '{"한식","볶음"}'),

  ('연어구이 정식', 580,
   '[{"name":"연어","qty":"200g"},{"name":"레몬","qty":"1/2개"},{"name":"아스파라거스","qty":"6대"},{"name":"버터","qty":"20g"}]',
   true, '연어 30g 으깨서 죽에', '{"생선","구이"}'),

  ('김치찌개', 510,
   '[{"name":"묵은지","qty":"200g"},{"name":"돼지고기","qty":"150g"},{"name":"두부","qty":"1모"},{"name":"대파","qty":"1대"}]',
   false, null, '{"한식","찌개"}'),

  ('계란 토마토 볶음', 320,
   '[{"name":"달걀","qty":"3개"},{"name":"토마토","qty":"2개"},{"name":"대파","qty":"1대"}]',
   true, '노른자만, 토마토 으깨서', '{"볶음","간단"}'),

  ('시금치 된장국', 220,
   '[{"name":"시금치","qty":"1단"},{"name":"된장","qty":"2T"},{"name":"바지락","qty":"200g"}]',
   true, '시금치 잎만, 바지락 X', '{"한식","국"}'),

  ('버섯 리조또', 480,
   '[{"name":"표고","qty":"5개"},{"name":"쌀","qty":"1.5컵"},{"name":"파마산","qty":"30g"},{"name":"버터","qty":"15g"}]',
   false, null, '{"양식","밥"}'),

  ('오이냉국', 80,
   '[{"name":"오이","qty":"2개"},{"name":"식초","qty":"2T"},{"name":"국간장","qty":"1T"}]',
   false, null, '{"한식","국","여름"}'),

  ('고등어구이', 420,
   '[{"name":"고등어","qty":"1마리"},{"name":"소금","qty":"약간"},{"name":"레몬","qty":"1/2개"}]',
   false, null, '{"생선","구이"}'),

  ('잡채', 460,
   '[{"name":"당면","qty":"200g"},{"name":"소고기","qty":"150g"},{"name":"시금치","qty":"1단"},{"name":"당근","qty":"1개"}]',
   false, null, '{"한식","명절"}'),

  ('그릭 요거트 볼', 280,
   '[{"name":"그릭요거트","qty":"200g"},{"name":"블루베리","qty":"50g"},{"name":"꿀","qty":"1T"},{"name":"그래놀라","qty":"30g"}]',
   false, null, '{"아침","간편"}'),

  ('닭곰탕', 410,
   '[{"name":"닭","qty":"1/2마리"},{"name":"대파","qty":"2대"},{"name":"마늘","qty":"통째"},{"name":"소금","qty":"약간"}]',
   true, '닭 살코기 잘게 찢어 죽에', '{"한식","국"}'),

  ('비빔밥', 590,
   '[{"name":"시금치","qty":"1줌"},{"name":"콩나물","qty":"1줌"},{"name":"소고기","qty":"100g"},{"name":"계란","qty":"1개"},{"name":"고추장","qty":"2T"}]',
   false, null, '{"한식","밥"}'),

  ('두부면 파스타', 350,
   '[{"name":"두부면","qty":"200g"},{"name":"방울토마토","qty":"10개"},{"name":"바질","qty":"약간"},{"name":"올리브오일","qty":"2T"}]',
   false, null, '{"양식","건강식"}'),

  ('갈비찜', 720,
   '[{"name":"소갈비","qty":"500g"},{"name":"무","qty":"1/4개"},{"name":"당근","qty":"1개"},{"name":"간장","qty":"4T"}]',
   true, '갈빗살 30g 잘게 찢어', '{"한식","찜"}'),

  ('단호박 수프', 240,
   '[{"name":"단호박","qty":"1/2개"},{"name":"우유","qty":"200ml"},{"name":"버터","qty":"10g"}]',
   true, '단호박 으깨서 그대로', '{"수프","이유식"}'),

  ('오트밀 죽', 290,
   '[{"name":"오트밀","qty":"60g"},{"name":"우유","qty":"200ml"},{"name":"바나나","qty":"1개"}]',
   false, null, '{"아침","간편"}'),

  ('아보카도 토스트', 360,
   '[{"name":"식빵","qty":"2장"},{"name":"아보카도","qty":"1개"},{"name":"계란","qty":"2개"}]',
   false, null, '{"아침","간편"}')

on conflict (name) do update set
  kcal        = excluded.kcal,
  ingredients = excluded.ingredients,
  baby        = excluded.baby,
  baby_note   = excluded.baby_note,
  tags        = excluded.tags;
