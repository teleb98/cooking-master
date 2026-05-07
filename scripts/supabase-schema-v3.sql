-- Cooking Master — Schema v3 migration
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (all statements are idempotent).

-- ── user_profiles: 선호 재료 / 알레르기 컬럼 ────────────────
alter table public.user_profiles
  add column if not exists baby_name   text,
  add column if not exists food_likes  jsonb default '[]',
  add column if not exists allergies   jsonb default '[]';

-- ── recipes: 상세 조리법 컬럼 ───────────────────────────────
alter table public.recipes
  add column if not exists steps     jsonb    default '[]',
  add column if not exists prep_time integer,
  add column if not exists cook_time integer,
  add column if not exists serving   integer,
  add column if not exists tips      text,
  add column if not exists nutrition jsonb;

-- ── 레시피 시드 보충 (새 메뉴 추가) ────────────────────────
insert into public.recipes (name, kcal, ingredients, baby, baby_note, tags) values

  ('된장찌개', 380,
   '[{"name":"두부","qty":"1/2모"},{"name":"호박","qty":"1/2개"},{"name":"감자","qty":"1개"},{"name":"된장","qty":"3T"},{"name":"바지락","qty":"100g"}]',
   true, '건더기 잘게 썰기, 간 X', '{"한식","찌개"}'),

  ('순두부찌개', 420,
   '[{"name":"순두부","qty":"1팩"},{"name":"돼지고기","qty":"100g"},{"name":"달걀","qty":"1개"},{"name":"고추가루","qty":"2T"},{"name":"대파","qty":"1대"}]',
   false, null, '{"한식","찌개"}'),

  ('청국장찌개', 390,
   '[{"name":"청국장","qty":"3T"},{"name":"두부","qty":"1/2모"},{"name":"배추김치","qty":"100g"},{"name":"대파","qty":"1대"}]',
   false, null, '{"한식","찌개"}'),

  ('닭볶음탕', 520,
   '[{"name":"닭","qty":"1/2마리"},{"name":"감자","qty":"2개"},{"name":"당근","qty":"1개"},{"name":"고추장","qty":"2T"},{"name":"간장","qty":"2T"}]',
   false, null, '{"한식","찜"}'),

  ('삼겹살 구이', 680,
   '[{"name":"삼겹살","qty":"300g"},{"name":"상추","qty":"1줌"},{"name":"마늘","qty":"10쪽"},{"name":"쌈장","qty":"2T"}]',
   false, null, '{"한식","구이"}'),

  ('스테이크', 620,
   '[{"name":"등심","qty":"200g"},{"name":"버터","qty":"20g"},{"name":"로즈마리","qty":"2줄기"},{"name":"마늘","qty":"3쪽"}]',
   false, null, '{"양식","구이"}'),

  ('카레라이스', 560,
   '[{"name":"카레블록","qty":"2칸"},{"name":"감자","qty":"2개"},{"name":"당근","qty":"1개"},{"name":"양파","qty":"1개"},{"name":"닭가슴살","qty":"150g"}]',
   true, '건더기 으깨서 부드럽게', '{"양식","밥"}'),

  ('닭가슴살 덮밥', 480,
   '[{"name":"닭가슴살","qty":"200g"},{"name":"밥","qty":"1공기"},{"name":"간장","qty":"2T"},{"name":"참기름","qty":"1T"},{"name":"달걀","qty":"1개"}]',
   false, null, '{"한식","밥"}'),

  ('참치마요 덮밥', 510,
   '[{"name":"참치캔","qty":"1개"},{"name":"마요네즈","qty":"2T"},{"name":"밥","qty":"1공기"},{"name":"오이","qty":"1/2개"},{"name":"깨","qty":"약간"}]',
   false, null, '{"한식","밥","간편"}'),

  ('계란찜', 180,
   '[{"name":"달걀","qty":"3개"},{"name":"다시마육수","qty":"200ml"},{"name":"소금","qty":"약간"},{"name":"대파","qty":"약간"}]',
   true, '부드럽게 쪄서 으깨기', '{"한식","반찬"}'),

  ('콩나물국밥', 430,
   '[{"name":"콩나물","qty":"200g"},{"name":"밥","qty":"1공기"},{"name":"달걀","qty":"1개"},{"name":"대파","qty":"1대"},{"name":"국간장","qty":"1T"}]',
   false, null, '{"한식","국"}'),

  ('떡볶이', 450,
   '[{"name":"떡","qty":"300g"},{"name":"어묵","qty":"2장"},{"name":"고추장","qty":"3T"},{"name":"설탕","qty":"1T"},{"name":"대파","qty":"1대"}]',
   false, null, '{"한식","분식"}'),

  ('라볶이', 490,
   '[{"name":"라면","qty":"1개"},{"name":"떡","qty":"150g"},{"name":"고추장","qty":"2T"},{"name":"달걀","qty":"1개"},{"name":"대파","qty":"1대"}]',
   false, null, '{"한식","분식"}'),

  ('유부초밥', 400,
   '[{"name":"유부","qty":"10개"},{"name":"밥","qty":"1.5공기"},{"name":"식초","qty":"2T"},{"name":"설탕","qty":"1T"},{"name":"소금","qty":"약간"}]',
   false, null, '{"한식","일식"}'),

  ('연두부 샐러드', 200,
   '[{"name":"연두부","qty":"1팩"},{"name":"방울토마토","qty":"8개"},{"name":"오이","qty":"1/2개"},{"name":"폰즈소스","qty":"2T"}]',
   true, '연두부 그대로 으깨서', '{"샐러드","건강식"}'),

  ('닭가슴살 볶음밥', 520,
   '[{"name":"닭가슴살","qty":"150g"},{"name":"밥","qty":"1공기"},{"name":"달걀","qty":"2개"},{"name":"당근","qty":"1/2개"},{"name":"간장","qty":"1T"}]',
   false, null, '{"한식","밥","볶음"}'),

  ('미역 줄기 볶음', 120,
   '[{"name":"미역줄기","qty":"200g"},{"name":"참기름","qty":"1T"},{"name":"간장","qty":"1T"},{"name":"마늘","qty":"3쪽"}]',
   false, null, '{"한식","반찬"}'),

  ('고구마 맛탕', 350,
   '[{"name":"고구마","qty":"2개"},{"name":"설탕","qty":"3T"},{"name":"식용유","qty":"충분히"},{"name":"깨","qty":"약간"}]',
   true, '부드럽게 익혀서 으깨기', '{"한식","반찬"}'),

  ('감자전', 310,
   '[{"name":"감자","qty":"3개"},{"name":"소금","qty":"약간"},{"name":"식용유","qty":"3T"}]',
   true, '부드럽게 구워서 으깨기', '{"한식","전"}'),

  ('해물파전', 480,
   '[{"name":"부침가루","qty":"1컵"},{"name":"새우","qty":"100g"},{"name":"오징어","qty":"1/2마리"},{"name":"대파","qty":"3대"}]',
   false, null, '{"한식","전"}')

on conflict (name) do update set
  kcal        = excluded.kcal,
  ingredients = excluded.ingredients,
  baby        = excluded.baby,
  baby_note   = excluded.baby_note,
  tags        = excluded.tags;
