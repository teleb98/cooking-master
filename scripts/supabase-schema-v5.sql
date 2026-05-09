-- ============================================================
-- Cooking Master — Supabase Migration v5 (2026-05-09)
-- 가족 그룹 연결 + 공유 식단 구조
-- Supabase SQL 에디터에서 실행하세요
-- ============================================================

-- 1. 가족 그룹 컨테이너
CREATE TABLE IF NOT EXISTS family_groups (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  family_type  TEXT        NOT NULL DEFAULT 'couple',
  shopping_day INTEGER     NOT NULL DEFAULT 6,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 그룹 내 멤버 (연결 상태 포함)
CREATE TABLE IF NOT EXISTS family_members (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  family_group_id UUID        NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id         TEXT        REFERENCES users(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'partner',  -- owner | partner | baby
  status          TEXT        NOT NULL DEFAULT 'pending',  -- pending | active
  invited_at      TIMESTAMPTZ DEFAULT NOW(),
  connected_at    TIMESTAMPTZ
);

-- user_id가 있는 경우에만 (family_group_id, user_id) 유니크
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_group_user
  ON family_members(family_group_id, user_id) WHERE user_id IS NOT NULL;

-- 3. user_profiles에 family_group_id 추가
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS family_group_id UUID REFERENCES family_groups(id);

-- 4. invite_tokens에 family_group_id 추가
ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS family_group_id UUID REFERENCES family_groups(id);

-- 5. meal_plans에 family_group_id 추가 (연결 후 공유 식단)
ALTER TABLE meal_plans
  ADD COLUMN IF NOT EXISTS family_group_id UUID REFERENCES family_groups(id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_family_members_group    ON family_members(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user     ON family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_family_group ON meal_plans(family_group_id);

-- RLS 비활성 (Service Role Key로만 접근)
ALTER TABLE family_groups  DISABLE ROW LEVEL SECURITY;
ALTER TABLE family_members DISABLE ROW LEVEL SECURITY;
