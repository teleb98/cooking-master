-- v9: 수익화 기반 — user_profiles에 플랜/AI 사용량 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan              TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'premium')),
  ADD COLUMN IF NOT EXISTS plan_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_generate_count INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_chat_turns     INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_usage_month    TEXT NOT NULL DEFAULT '';
