-- ============================================================
-- v6: 잔재 테이블 DROP
-- 코드에서 완전히 미사용 확인 후 실행
-- Supabase Dashboard > SQL Editor에서 실행
-- ============================================================

-- grocery_lists: grocery_items 테이블로 대체됨
DROP TABLE IF EXISTS grocery_lists CASCADE;

-- profiles: user_profiles 테이블로 대체됨
DROP TABLE IF EXISTS profiles CASCADE;

-- weekly_plans: meal_plans 테이블로 대체됨
DROP TABLE IF EXISTS weekly_plans CASCADE;
