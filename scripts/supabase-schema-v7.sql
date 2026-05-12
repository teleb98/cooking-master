-- v7: 커스텀 레시피 — recipes 테이블에 user_id 컬럼 추가
-- NULL = 공유 라이브러리 레시피, UUID = 사용자 개인 레시피

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes (user_id);

-- RLS: 서비스 롤 키로만 접근하므로 별도 정책 불필요
