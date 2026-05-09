-- ============================================================
-- Cooking Master — Supabase Migration v4 (2026-05-09)
-- Supabase SQL 에디터에서 실행하세요
-- ============================================================

-- 1. user_profiles 취향 컬럼 (온보딩 preferences 스텝)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS food_likes JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS allergies  JSONB DEFAULT '[]';

-- 2. recipes 상세 컬럼 (레시피 상세 화면)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS steps     JSONB    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS prep_time INTEGER,
  ADD COLUMN IF NOT EXISTS cook_time INTEGER,
  ADD COLUMN IF NOT EXISTS serving   INTEGER,
  ADD COLUMN IF NOT EXISTS tips      TEXT,
  ADD COLUMN IF NOT EXISTS nutrition JSONB;

-- 3. 초대 토큰 테이블 (가족 그룹 연결)
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token       TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  invited_by  TEXT        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days') NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT        REFERENCES users(id) ON DELETE SET NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token      ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_invited_by ON invite_tokens(invited_by);

-- RLS (Service Role Key로만 접근하므로 비활성)
ALTER TABLE invite_tokens DISABLE ROW LEVEL SECURITY;
