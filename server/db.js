/**
 * DB adapter — SQLite (local dev) or PostgreSQL (production via DATABASE_URL)
 * Unified async interface: getOne / getMany / run
 * Param style: always use $1 $2 … (converted to ? for SQLite internally)
 */

const USE_PG = !!process.env.DATABASE_URL;

const SCHEMA_PG = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    provider      TEXT NOT NULL,
    provider_id   TEXT NOT NULL,
    name          TEXT NOT NULL,
    email         TEXT,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS family_groups (
    id           TEXT PRIMARY KEY,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    family_type  TEXT NOT NULL DEFAULT 'couple',
    shopping_day INTEGER NOT NULL DEFAULT 6,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    family_type           TEXT    NOT NULL DEFAULT 'couple',
    baby_birthday         TEXT,
    baby_name             TEXT,
    children              TEXT NOT NULL DEFAULT '[]',
    shopping_day          INTEGER NOT NULL DEFAULT 6,
    partner_name          TEXT,
    food_likes            TEXT NOT NULL DEFAULT '[]',
    allergies             TEXT NOT NULL DEFAULT '[]',
    family_group_id       TEXT REFERENCES family_groups(id),
    push_subscription     TEXT,
    plan                  TEXT NOT NULL DEFAULT 'free',
    plan_expires_at       TIMESTAMPTZ,
    plan_start_at         TIMESTAMPTZ,
    plan_renewed_at       TIMESTAMPTZ,
    plan_cancelled_at     TIMESTAMPTZ,
    billing_key           TEXT,
    billing_customer_key  TEXT,
    ai_generate_count     INT  NOT NULL DEFAULT 0,
    ai_chat_turns         INT  NOT NULL DEFAULT 0,
    ai_usage_month        TEXT NOT NULL DEFAULT '',
    is_admin              BOOLEAN NOT NULL DEFAULT FALSE,
    is_test               BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    kcal        INTEGER DEFAULT 0,
    ingredients TEXT NOT NULL DEFAULT '[]',
    baby        BOOLEAN DEFAULT FALSE,
    baby_note   TEXT,
    tags        TEXT NOT NULL DEFAULT '[]',
    steps       TEXT NOT NULL DEFAULT '[]',
    prep_time   INTEGER,
    cook_time   INTEGER,
    serving     INTEGER,
    tips        TEXT,
    nutrition   TEXT,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes (user_id);

  CREATE TABLE IF NOT EXISTS meal_plans (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_date       TEXT NOT NULL,
    meal_type       TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    menu_name       TEXT,
    kcal            INTEGER,
    is_baby         BOOLEAN DEFAULT FALSE,
    family_group_id TEXT REFERENCES family_groups(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, plan_date, meal_type)
  );
  CREATE INDEX IF NOT EXISTS idx_meal_plans_family_group ON meal_plans(family_group_id);
  CREATE INDEX IF NOT EXISTS idx_meal_plans_user_date ON meal_plans(user_id, plan_date);

  CREATE TABLE IF NOT EXISTS grocery_items (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start  TEXT NOT NULL,
    name        TEXT NOT NULL,
    qty         TEXT DEFAULT '',
    category    TEXT DEFAULT '기타',
    for_baby    BOOLEAN DEFAULT FALSE,
    is_bought   BOOLEAN DEFAULT FALSE,
    menu_count  INTEGER DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_grocery_items_user_week ON grocery_items(user_id, week_start);

  CREATE TABLE IF NOT EXISTS family_members (
    id              TEXT PRIMARY KEY,
    family_group_id TEXT NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
    user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'partner',
    status          TEXT NOT NULL DEFAULT 'pending',
    invited_at      TIMESTAMPTZ DEFAULT NOW(),
    connected_at    TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_group_user
    ON family_members(family_group_id, user_id) WHERE user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_family_members_group ON family_members(family_group_id);
  CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);

  CREATE TABLE IF NOT EXISTS invite_tokens (
    id              TEXT PRIMARY KEY,
    token           TEXT UNIQUE NOT NULL,
    invited_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_group_id TEXT REFERENCES family_groups(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    accepted_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_invite_tokens_invited_by ON invite_tokens(invited_by);

  CREATE TABLE IF NOT EXISTS fridge_items (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_group_id TEXT REFERENCES family_groups(id),
    name            TEXT NOT NULL,
    qty             TEXT DEFAULT '1개',
    category        TEXT DEFAULT '기타',
    expires_at      TIMESTAMPTZ,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_fridge_items_user ON fridge_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_fridge_items_family ON fridge_items(family_group_id);
`;

const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    provider      TEXT NOT NULL,
    provider_id   TEXT NOT NULL,
    name          TEXT NOT NULL,
    email         TEXT,
    avatar_url    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS family_groups (
    id           TEXT PRIMARY KEY,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    family_type  TEXT NOT NULL DEFAULT 'couple',
    shopping_day INTEGER NOT NULL DEFAULT 6,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    family_type           TEXT    NOT NULL DEFAULT 'couple',
    baby_birthday         TEXT,
    baby_name             TEXT,
    children              TEXT NOT NULL DEFAULT '[]',
    shopping_day          INTEGER NOT NULL DEFAULT 6,
    partner_name          TEXT,
    food_likes            TEXT NOT NULL DEFAULT '[]',
    allergies             TEXT NOT NULL DEFAULT '[]',
    family_group_id       TEXT REFERENCES family_groups(id),
    push_subscription     TEXT,
    plan                  TEXT NOT NULL DEFAULT 'free',
    plan_expires_at       TEXT,
    plan_start_at         TEXT,
    plan_renewed_at       TEXT,
    plan_cancelled_at     TEXT,
    billing_key           TEXT,
    billing_customer_key  TEXT,
    ai_generate_count     INTEGER NOT NULL DEFAULT 0,
    ai_chat_turns         INTEGER NOT NULL DEFAULT 0,
    ai_usage_month        TEXT NOT NULL DEFAULT '',
    is_admin              INTEGER NOT NULL DEFAULT 0,
    is_test               INTEGER NOT NULL DEFAULT 0,
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    kcal        INTEGER DEFAULT 0,
    ingredients TEXT NOT NULL DEFAULT '[]',
    baby        INTEGER DEFAULT 0,
    baby_note   TEXT,
    tags        TEXT NOT NULL DEFAULT '[]',
    steps       TEXT NOT NULL DEFAULT '[]',
    prep_time   INTEGER,
    cook_time   INTEGER,
    serving     INTEGER,
    tips        TEXT,
    nutrition   TEXT,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes (user_id);

  CREATE TABLE IF NOT EXISTS meal_plans (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_date       TEXT NOT NULL,
    meal_type       TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    menu_name       TEXT,
    kcal            INTEGER,
    is_baby         INTEGER DEFAULT 0,
    family_group_id TEXT REFERENCES family_groups(id),
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, plan_date, meal_type)
  );
  CREATE INDEX IF NOT EXISTS idx_meal_plans_family_group ON meal_plans(family_group_id);
  CREATE INDEX IF NOT EXISTS idx_meal_plans_user_date ON meal_plans(user_id, plan_date);

  CREATE TABLE IF NOT EXISTS grocery_items (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start  TEXT NOT NULL,
    name        TEXT NOT NULL,
    qty         TEXT DEFAULT '',
    category    TEXT DEFAULT '기타',
    for_baby    INTEGER DEFAULT 0,
    is_bought   INTEGER DEFAULT 0,
    menu_count  INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_grocery_items_user_week ON grocery_items(user_id, week_start);

  CREATE TABLE IF NOT EXISTS family_members (
    id              TEXT PRIMARY KEY,
    family_group_id TEXT NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
    user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'partner',
    status          TEXT NOT NULL DEFAULT 'pending',
    invited_at      TEXT DEFAULT (datetime('now')),
    connected_at    TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_group_user
    ON family_members(family_group_id, user_id) WHERE user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_family_members_group ON family_members(family_group_id);
  CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);

  CREATE TABLE IF NOT EXISTS invite_tokens (
    id              TEXT PRIMARY KEY,
    token           TEXT UNIQUE NOT NULL,
    invited_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_group_id TEXT REFERENCES family_groups(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL,
    accepted_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    accepted_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_invite_tokens_invited_by ON invite_tokens(invited_by);

  CREATE TABLE IF NOT EXISTS fridge_items (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_group_id TEXT REFERENCES family_groups(id),
    name            TEXT NOT NULL,
    qty             TEXT DEFAULT '1개',
    category        TEXT DEFAULT '기타',
    expires_at      TEXT,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    consumed_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fridge_items_user ON fridge_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_fridge_items_family ON fridge_items(family_group_id);
`;

// ── PostgreSQL ──────────────────────────────────────────
async function createPgAdapter() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  await pool.query(SCHEMA_PG);

  console.log('[db] connected to PostgreSQL');
  return {
    getOne:  async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows[0] ?? null; },
    getMany: async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; },
    run:     async (sql, p = []) => { await pool.query(sql, p); },
  };
}

// ── SQLite ─────────────────────────────────────────────
async function createSqliteAdapter() {
  const { default: Database } = await import('better-sqlite3');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');

  const __dir = dirname(fileURLToPath(import.meta.url));
  const sqlite = new Database(process.env.SQLITE_PATH || join(__dir, 'cooking-master.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(SCHEMA_SQLITE);

  await seedRecipesIfEmpty(sqlite);

  // $1 $2 … → ? (repeated $N are expanded with the same value each time)
  const toSQLite = (sql, p) => {
    const params = [];
    const converted = sql.replace(/\$(\d+)/g, (_, n) => { params.push(p[+n - 1]); return '?'; });
    return { converted, params };
  };

  console.log('[db] connected to SQLite (local dev)');
  return {
    getOne:  (sql, p = []) => { const { converted, params } = toSQLite(sql, p); return sqlite.prepare(converted).get(...params) ?? null; },
    getMany: (sql, p = []) => { const { converted, params } = toSQLite(sql, p); return sqlite.prepare(converted).all(...params); },
    run:     (sql, p = []) => { const { converted, params } = toSQLite(sql, p); sqlite.prepare(converted).run(...params); },
  };
}

const DEFAULT_RECIPES = [
  ['두부조림 백반', 540, [{ name: '두부', qty: '2모' }, { name: '간장', qty: '3T' }, { name: '대파', qty: '1대' }, { name: '마늘', qty: '5쪽' }], false, null, ['한식', '반찬']],
  ['닭가슴살 샐러드', 380, [{ name: '닭가슴살', qty: '200g' }, { name: '양상추', qty: '1/2통' }, { name: '방울토마토', qty: '10개' }, { name: '올리브오일', qty: '2T' }], false, null, ['샐러드', '건강식']],
  ['소고기 미역국', 460, [{ name: '소고기', qty: '200g' }, { name: '미역', qty: '30g' }, { name: '국간장', qty: '2T' }, { name: '참기름', qty: '1T' }], true, '미역 부드럽게 다지기, 간 X', ['한식', '국']],
  ['제육볶음', 620, [{ name: '돼지고기', qty: '300g' }, { name: '고추장', qty: '3T' }, { name: '양파', qty: '1개' }, { name: '대파', qty: '1대' }], false, null, ['한식', '볶음']],
  ['연어구이 정식', 580, [{ name: '연어', qty: '200g' }, { name: '레몬', qty: '1/2개' }, { name: '아스파라거스', qty: '6대' }, { name: '버터', qty: '20g' }], true, '연어 30g 으깨서 죽에', ['생선', '구이']],
  ['김치찌개', 510, [{ name: '묵은지', qty: '200g' }, { name: '돼지고기', qty: '150g' }, { name: '두부', qty: '1모' }, { name: '대파', qty: '1대' }], false, null, ['한식', '찌개']],
  ['계란 토마토 볶음', 320, [{ name: '달걀', qty: '3개' }, { name: '토마토', qty: '2개' }, { name: '대파', qty: '1대' }], true, '노른자만, 토마토 으깨서', ['볶음', '간단']],
  ['시금치 된장국', 220, [{ name: '시금치', qty: '1단' }, { name: '된장', qty: '2T' }, { name: '바지락', qty: '200g' }], true, '시금치 잎만, 바지락 X', ['한식', '국']],
  ['버섯 리조또', 480, [{ name: '표고', qty: '5개' }, { name: '쌀', qty: '1.5컵' }, { name: '파마산', qty: '30g' }, { name: '버터', qty: '15g' }], false, null, ['양식', '밥']],
  ['오이냉국', 80, [{ name: '오이', qty: '2개' }, { name: '식초', qty: '2T' }, { name: '국간장', qty: '1T' }], false, null, ['한식', '국', '여름']],
  ['고등어구이', 420, [{ name: '고등어', qty: '1마리' }, { name: '소금', qty: '약간' }, { name: '레몬', qty: '1/2개' }], false, null, ['생선', '구이']],
  ['잡채', 460, [{ name: '당면', qty: '200g' }, { name: '소고기', qty: '150g' }, { name: '시금치', qty: '1단' }, { name: '당근', qty: '1개' }], false, null, ['한식', '명절']],
  ['그릭 요거트 볼', 280, [{ name: '그릭요거트', qty: '200g' }, { name: '블루베리', qty: '50g' }, { name: '꿀', qty: '1T' }, { name: '그래놀라', qty: '30g' }], false, null, ['아침', '간편']],
  ['닭곰탕', 410, [{ name: '닭', qty: '1/2마리' }, { name: '대파', qty: '2대' }, { name: '마늘', qty: '통째' }, { name: '소금', qty: '약간' }], true, '닭 살코기 잘게 찢어 죽에', ['한식', '국']],
  ['비빔밥', 590, [{ name: '시금치', qty: '1줌' }, { name: '콩나물', qty: '1줌' }, { name: '소고기', qty: '100g' }, { name: '계란', qty: '1개' }, { name: '고추장', qty: '2T' }], false, null, ['한식', '밥']],
  ['두부면 파스타', 350, [{ name: '두부면', qty: '200g' }, { name: '방울토마토', qty: '10개' }, { name: '바질', qty: '약간' }, { name: '올리브오일', qty: '2T' }], false, null, ['양식', '건강식']],
  ['갈비찜', 720, [{ name: '소갈비', qty: '500g' }, { name: '무', qty: '1/4개' }, { name: '당근', qty: '1개' }, { name: '간장', qty: '4T' }], true, '갈빗살 30g 잘게 찢어', ['한식', '찜']],
  ['단호박 수프', 240, [{ name: '단호박', qty: '1/2개' }, { name: '우유', qty: '200ml' }, { name: '버터', qty: '10g' }], true, '단호박 으깨서 그대로', ['수프', '이유식']],
  ['오트밀 죽', 290, [{ name: '오트밀', qty: '60g' }, { name: '우유', qty: '200ml' }, { name: '바나나', qty: '1개' }], false, null, ['아침', '간편']],
  ['아보카도 토스트', 360, [{ name: '식빵', qty: '2장' }, { name: '아보카도', qty: '1개' }, { name: '계란', qty: '2개' }], false, null, ['아침', '간편']],
  ['갈치조림', 480, [{ name: '갈치', qty: '1마리' }, { name: '무', qty: '1/4개' }, { name: '고추장', qty: '2T' }, { name: '대파', qty: '1대' }], false, null, ['생선', '조림']],
  ['된장찌개', 450, [{ name: '된장', qty: '3T' }, { name: '두부', qty: '1/2모' }, { name: '애호박', qty: '1/2개' }, { name: '팽이버섯', qty: '1줌' }], false, null, ['한식', '찌개']],
  ['순두부찌개', 420, [{ name: '순두부', qty: '1봉' }, { name: '계란', qty: '1개' }, { name: '대파', qty: '1대' }, { name: '국간장', qty: '1T' }], true, '순두부만 으깨서, 양념 X', ['한식', '찌개']],
  ['콩나물국밥', 480, [{ name: '콩나물', qty: '200g' }, { name: '밥', qty: '1공기' }, { name: '계란', qty: '1개' }, { name: '국간장', qty: '2T' }], false, null, ['한식', '밥']],
  ['떡국', 520, [{ name: '떡국떡', qty: '300g' }, { name: '계란', qty: '1개' }, { name: '소고기', qty: '100g' }, { name: '대파', qty: '1대' }], true, '떡 잘게 잘라서', ['한식', '국']],
  ['만두국', 500, [{ name: '만두', qty: '10개' }, { name: '계란', qty: '1개' }, { name: '대파', qty: '1대' }, { name: '국간장', qty: '1T' }], false, null, ['한식', '국']],
  ['삼계탕', 650, [{ name: '닭', qty: '1마리' }, { name: '인삼', qty: '1뿌리' }, { name: '대추', qty: '5개' }, { name: '마늘', qty: '10쪽' }], true, '닭살만 발라 죽에', ['한식', '탕']],
  ['갈비탕', 600, [{ name: '소갈비', qty: '400g' }, { name: '무', qty: '1/4개' }, { name: '대파', qty: '1대' }, { name: '마늘', qty: '5쪽' }], true, '갈빗살 잘게 찢어', ['한식', '탕']],
  ['육개장', 600, [{ name: '소고기', qty: '200g' }, { name: '고사리', qty: '1줌' }, { name: '대파', qty: '3대' }, { name: '고추기름', qty: '2T' }], false, null, ['한식', '탕']],
  ['동태찌개', 430, [{ name: '동태', qty: '1마리' }, { name: '무', qty: '1/4개' }, { name: '고추장', qty: '2T' }, { name: '미나리', qty: '1줌' }], false, null, ['생선', '찌개']],
  ['새우볶음밥', 560, [{ name: '새우', qty: '150g' }, { name: '밥', qty: '1공기' }, { name: '계란', qty: '1개' }, { name: '대파', qty: '1대' }], false, null, ['밥', '볶음']],
  ['치킨카레', 620, [{ name: '닭가슴살', qty: '200g' }, { name: '카레가루', qty: '3T' }, { name: '양파', qty: '1개' }, { name: '당근', qty: '1/2개' }], false, null, ['양식', '카레']],
  ['토마토파스타', 540, [{ name: '스파게티면', qty: '100g' }, { name: '토마토소스', qty: '200g' }, { name: '마늘', qty: '3쪽' }, { name: '올리브오일', qty: '1T' }], false, null, ['양식']],
  ['크림파스타', 680, [{ name: '페투치니면', qty: '100g' }, { name: '생크림', qty: '200ml' }, { name: '베이컨', qty: '50g' }, { name: '파마산', qty: '20g' }], false, null, ['양식']],
  ['함박스테이크', 650, [{ name: '다진소고기', qty: '200g' }, { name: '양파', qty: '1/2개' }, { name: '데미글라스소스', qty: '100ml' }, { name: '계란', qty: '1개' }], true, '잘게 다져서, 소스 X', ['양식']],
  ['연어스테이크', 540, [{ name: '연어', qty: '200g' }, { name: '버터', qty: '15g' }, { name: '레몬', qty: '1/2개' }, { name: '브로콜리', qty: '1/2개' }], true, '연어 으깨서, 레몬 X', ['양식', '생선']],
  ['닭볶음탕', 640, [{ name: '닭', qty: '1/2마리' }, { name: '감자', qty: '2개' }, { name: '고추장', qty: '3T' }, { name: '당근', qty: '1개' }], false, null, ['한식']],
  ['오징어볶음', 520, [{ name: '오징어', qty: '1마리' }, { name: '양파', qty: '1개' }, { name: '고추장', qty: '2T' }, { name: '대파', qty: '1대' }], false, null, ['한식', '볶음']],
  ['콩나물밥', 480, [{ name: '콩나물', qty: '200g' }, { name: '쌀', qty: '1.5컵' }, { name: '간장', qty: '2T' }, { name: '참기름', qty: '1T' }], false, null, ['한식', '밥']],
  ['김밥', 450, [{ name: '밥', qty: '1공기' }, { name: '김', qty: '2장' }, { name: '단무지', qty: '2줄' }, { name: '계란', qty: '2개' }], false, null, ['한식', '간편']],
  ['떡갈비', 580, [{ name: '다진소고기', qty: '250g' }, { name: '간장', qty: '2T' }, { name: '배', qty: '1/4개' }, { name: '마늘', qty: '3쪽' }], true, '잘게 잘라서', ['한식']],
  ['부대찌개', 600, [{ name: '소시지', qty: '150g' }, { name: '스팸', qty: '100g' }, { name: '김치', qty: '150g' }, { name: '두부', qty: '1/2모' }], false, null, ['한식', '찌개']],
  ['황태해장국', 380, [{ name: '황태', qty: '50g' }, { name: '계란', qty: '1개' }, { name: '대파', qty: '1대' }, { name: '마늘', qty: '3쪽' }], true, '부드럽게 끓여서', ['한식', '국']],
  ['시래기된장국', 280, [{ name: '시래기', qty: '150g' }, { name: '된장', qty: '2T' }, { name: '멸치육수', qty: '500ml' }, { name: '대파', qty: '1대' }], false, null, ['한식', '국']],
  ['닭가슴살 볶음밥', 520, [{ name: '닭가슴살', qty: '150g' }, { name: '밥', qty: '1공기' }, { name: '당근', qty: '1/2개' }, { name: '계란', qty: '1개' }], true, '잘게 다져서', ['밥', '볶음']],
  ['두부김치', 460, [{ name: '두부', qty: '1모' }, { name: '김치', qty: '200g' }, { name: '돼지고기', qty: '100g' }, { name: '대파', qty: '1대' }], false, null, ['한식']],
  ['어묵국', 320, [{ name: '어묵', qty: '200g' }, { name: '무', qty: '1/4개' }, { name: '대파', qty: '1대' }, { name: '국간장', qty: '1T' }], false, null, ['한식', '국']],
  ['콩국수', 480, [{ name: '소면', qty: '100g' }, { name: '콩물', qty: '400ml' }, { name: '오이', qty: '1/2개' }, { name: '방울토마토', qty: '5개' }], false, null, ['한식', '국수', '여름']],
  ['잔치국수', 460, [{ name: '소면', qty: '100g' }, { name: '멸치육수', qty: '500ml' }, { name: '애호박', qty: '1/4개' }, { name: '계란', qty: '1개' }], true, '면 짧게 잘라서', ['한식', '국수']],
  ['감자수프', 320, [{ name: '감자', qty: '2개' }, { name: '우유', qty: '300ml' }, { name: '버터', qty: '10g' }, { name: '양파', qty: '1/4개' }], true, '으깨서 그대로', ['수프', '간편']],

  // ── 51~100번 추가 레시피 ──────────────────────────────────────────────────
  // 한식 · 반찬·조림
  ['불고기', 580, [{ name: '소고기', qty: '300g' }, { name: '간장', qty: '3T' }, { name: '배', qty: '1/4개' }, { name: '마늘', qty: '3쪽' }, { name: '참기름', qty: '1T' }], true, '소고기 잘게 다져서', ['한식', '구이']],
  ['소고기 장조림', 320, [{ name: '소고기', qty: '200g' }, { name: '계란', qty: '3개' }, { name: '간장', qty: '3T' }, { name: '마늘', qty: '5쪽' }], true, '잘게 찢어서', ['한식', '반찬']],
  ['달걀찜', 180, [{ name: '계란', qty: '3개' }, { name: '새우', qty: '3마리' }, { name: '대파', qty: '약간' }, { name: '참기름', qty: '약간' }], true, '그대로', ['한식', '반찬', '이유식']],
  ['달걀 말이', 220, [{ name: '계란', qty: '4개' }, { name: '당근', qty: '약간' }, { name: '시금치', qty: '약간' }, { name: '소금', qty: '약간' }], true, '그대로', ['한식', '반찬', '이유식']],
  ['감자조림', 280, [{ name: '감자', qty: '3개' }, { name: '간장', qty: '2T' }, { name: '물엿', qty: '1T' }, { name: '대파', qty: '약간' }], true, '으깨서', ['한식', '반찬']],
  ['연근조림', 260, [{ name: '연근', qty: '200g' }, { name: '간장', qty: '2T' }, { name: '올리고당', qty: '1T' }, { name: '참깨', qty: '약간' }], false, null, ['한식', '반찬']],
  ['멸치볶음', 180, [{ name: '잔멸치', qty: '100g' }, { name: '마늘', qty: '2쪽' }, { name: '올리고당', qty: '1T' }, { name: '참깨', qty: '약간' }], false, null, ['한식', '반찬']],
  ['시금치나물', 120, [{ name: '시금치', qty: '200g' }, { name: '참기름', qty: '1T' }, { name: '간장', qty: '1T' }, { name: '마늘', qty: '1쪽' }], true, '잘게 다져서', ['한식', '반찬', '나물']],
  ['무생채', 80, [{ name: '무', qty: '1/2개' }, { name: '고추가루', qty: '1T' }, { name: '식초', qty: '1T' }, { name: '설탕', qty: '1T' }], false, null, ['한식', '반찬']],
  ['미역줄기볶음', 120, [{ name: '미역줄기', qty: '200g' }, { name: '참기름', qty: '1T' }, { name: '간장', qty: '1T' }, { name: '참깨', qty: '약간' }], true, '잘게 다져서', ['한식', '반찬']],
  ['굴비조림', 380, [{ name: '굴비', qty: '2마리' }, { name: '간장', qty: '2T' }, { name: '무', qty: '1/4개' }, { name: '대파', qty: '1대' }], false, null, ['한식', '생선', '조림']],

  // 한식 · 국·찌개·탕
  ['북어해장국', 350, [{ name: '북어포', qty: '50g' }, { name: '계란', qty: '1개' }, { name: '두부', qty: '1/4모' }, { name: '대파', qty: '1대' }], true, '부드럽게 끓여서', ['한식', '국', '해장']],
  ['배추된장국', 240, [{ name: '배추', qty: '1/4포기' }, { name: '된장', qty: '2T' }, { name: '두부', qty: '1/4모' }, { name: '대파', qty: '1대' }], true, '배추 부드럽게 끓여서', ['한식', '국']],
  ['참치김치찌개', 480, [{ name: '참치통조림', qty: '1캔' }, { name: '김치', qty: '200g' }, { name: '두부', qty: '1/2모' }, { name: '대파', qty: '1대' }], false, null, ['한식', '찌개']],
  ['해물찌개', 520, [{ name: '조개', qty: '200g' }, { name: '새우', qty: '100g' }, { name: '두부', qty: '1/2모' }, { name: '애호박', qty: '1/2개' }], false, null, ['한식', '찌개', '해산물']],
  ['콩비지찌개', 380, [{ name: '콩비지', qty: '300g' }, { name: '돼지고기', qty: '100g' }, { name: '김치', qty: '100g' }, { name: '대파', qty: '1대' }], false, null, ['한식', '찌개']],
  ['뼈다귀 해장국', 520, [{ name: '돼지등뼈', qty: '500g' }, { name: '우거지', qty: '200g' }, { name: '된장', qty: '2T' }, { name: '대파', qty: '2대' }], false, null, ['한식', '국', '해장']],

  // 한식 · 밥·국밥·덮밥
  ['돼지국밥', 620, [{ name: '돼지뼈', qty: '500g' }, { name: '밥', qty: '1공기' }, { name: '대파', qty: '2대' }, { name: '부추', qty: '1줌' }], false, null, ['한식', '국밥']],
  ['순대국밥', 580, [{ name: '순대', qty: '200g' }, { name: '돼지내장', qty: '100g' }, { name: '밥', qty: '1공기' }, { name: '깍두기', qty: '100g' }], false, null, ['한식', '국밥']],
  ['참치마요 덮밥', 520, [{ name: '참치통조림', qty: '1캔' }, { name: '마요네즈', qty: '2T' }, { name: '밥', qty: '1공기' }, { name: '오이', qty: '1/4개' }], false, null, ['간편', '덮밥']],
  ['낙지덮밥', 520, [{ name: '낙지', qty: '1마리' }, { name: '양파', qty: '1/2개' }, { name: '고추장', qty: '2T' }, { name: '밥', qty: '1공기' }], false, null, ['한식', '덮밥', '해산물']],
  ['김치볶음밥', 540, [{ name: '김치', qty: '200g' }, { name: '밥', qty: '1공기' }, { name: '돼지고기', qty: '100g' }, { name: '계란', qty: '1개' }], false, null, ['한식', '밥', '볶음']],

  // 한식 · 전·튀김·분식
  ['해물파전', 480, [{ name: '오징어', qty: '1/2마리' }, { name: '새우', qty: '5마리' }, { name: '부추', qty: '1줌' }, { name: '부침가루', qty: '1컵' }], false, null, ['한식', '전']],
  ['떡볶이', 420, [{ name: '떡볶이떡', qty: '200g' }, { name: '고추장', qty: '2T' }, { name: '어묵', qty: '100g' }, { name: '대파', qty: '1대' }], false, null, ['한식', '분식']],
  ['닭강정', 640, [{ name: '닭', qty: '1/2마리' }, { name: '전분', qty: '4T' }, { name: '고추장', qty: '2T' }, { name: '올리고당', qty: '2T' }], false, null, ['한식', '튀김']],
  ['고구마 맛탕', 380, [{ name: '고구마', qty: '2개' }, { name: '설탕', qty: '3T' }, { name: '식용유', qty: '적당량' }], true, '으깨서', ['한식', '간식']],

  // 한식 · 구이·해산물볶음
  ['삼겹살 구이', 720, [{ name: '삼겹살', qty: '300g' }, { name: '상추', qty: '1봉' }, { name: '된장', qty: '1T' }, { name: '마늘', qty: '1통' }], false, null, ['한식', '구이']],
  ['쭈꾸미볶음', 480, [{ name: '쭈꾸미', qty: '300g' }, { name: '고추장', qty: '2T' }, { name: '양파', qty: '1개' }, { name: '대파', qty: '1대' }], false, null, ['한식', '볶음', '해산물']],
  ['낙지볶음', 460, [{ name: '낙지', qty: '2마리' }, { name: '고추장', qty: '2T' }, { name: '양파', qty: '1개' }, { name: '부추', qty: '1줌' }], false, null, ['한식', '볶음', '해산물']],
  ['골뱅이무침', 320, [{ name: '골뱅이통조림', qty: '1캔' }, { name: '오이', qty: '1개' }, { name: '양파', qty: '1/2개' }, { name: '고추장', qty: '2T' }], false, null, ['한식', '무침', '안주']],

  // 중식
  ['짜장면', 650, [{ name: '중면', qty: '200g' }, { name: '춘장', qty: '3T' }, { name: '양파', qty: '1개' }, { name: '돼지고기', qty: '100g' }, { name: '감자', qty: '1개' }], false, null, ['중식', '면']],
  ['짬뽕', 580, [{ name: '중면', qty: '200g' }, { name: '오징어', qty: '1/2마리' }, { name: '홍합', qty: '10개' }, { name: '배추', qty: '1/4포기' }, { name: '고추가루', qty: '2T' }], false, null, ['중식', '면']],
  ['탕수육', 680, [{ name: '돼지고기', qty: '250g' }, { name: '전분', qty: '5T' }, { name: '식초', qty: '2T' }, { name: '설탕', qty: '3T' }, { name: '당근', qty: '1/2개' }], false, null, ['중식']],
  ['마파두부', 420, [{ name: '두부', qty: '1모' }, { name: '돼지고기', qty: '100g' }, { name: '두반장', qty: '1T' }, { name: '대파', qty: '1대' }], false, null, ['중식']],

  // 일식
  ['볶음우동', 520, [{ name: '우동면', qty: '200g' }, { name: '소고기', qty: '100g' }, { name: '양파', qty: '1개' }, { name: '간장', qty: '2T' }], false, null, ['일식', '면']],
  ['오야코동', 580, [{ name: '닭가슴살', qty: '150g' }, { name: '계란', qty: '2개' }, { name: '양파', qty: '1/2개' }, { name: '밥', qty: '1공기' }, { name: '간장', qty: '2T' }], true, '닭 잘게 다져서', ['일식', '덮밥']],
  ['규동', 620, [{ name: '소고기', qty: '200g' }, { name: '양파', qty: '1개' }, { name: '밥', qty: '1공기' }, { name: '간장', qty: '2T' }, { name: '미림', qty: '1T' }], true, '소고기 잘게 다져서', ['일식', '덮밥']],
  ['돈까스 정식', 720, [{ name: '돼지고기', qty: '200g' }, { name: '빵가루', qty: '1컵' }, { name: '계란', qty: '1개' }, { name: '양배추', qty: '1/4개' }], false, null, ['양식', '일식']],
  ['카레우동', 540, [{ name: '우동면', qty: '200g' }, { name: '카레가루', qty: '2T' }, { name: '새우', qty: '5마리' }, { name: '양파', qty: '1/2개' }], false, null, ['일식', '면']],
  ['연어알 덮밥', 580, [{ name: '연어알', qty: '50g' }, { name: '밥', qty: '1공기' }, { name: '오이', qty: '1/4개' }, { name: '간장', qty: '1T' }, { name: '참기름', qty: '약간' }], false, null, ['일식', '덮밥']],

  // 양식 · 파스타·샐러드·건강식
  ['나폴리탄 스파게티', 560, [{ name: '스파게티면', qty: '100g' }, { name: '소시지', qty: '3개' }, { name: '양파', qty: '1/2개' }, { name: '케첩', qty: '3T' }], false, null, ['양식', '파스타']],
  ['카르보나라', 700, [{ name: '스파게티면', qty: '100g' }, { name: '베이컨', qty: '60g' }, { name: '달걀노른자', qty: '2개' }, { name: '파마산', qty: '30g' }, { name: '후추', qty: '약간' }], false, null, ['양식', '파스타']],
  ['시저샐러드', 320, [{ name: '로메인', qty: '1통' }, { name: '닭가슴살', qty: '100g' }, { name: '크루통', qty: '30g' }, { name: '파마산', qty: '20g' }, { name: '시저드레싱', qty: '3T' }], false, null, ['샐러드', '양식']],
  ['채소 닭가슴살 구이', 420, [{ name: '닭가슴살', qty: '200g' }, { name: '파프리카', qty: '1개' }, { name: '브로콜리', qty: '1/2개' }, { name: '올리브오일', qty: '2T' }], true, '닭 잘게 다져서', ['건강식', '다이어트']],
  ['퀴노아 채소 샐러드', 380, [{ name: '퀴노아', qty: '100g' }, { name: '아보카도', qty: '1/2개' }, { name: '루꼴라', qty: '1줌' }, { name: '방울토마토', qty: '10개' }], false, null, ['샐러드', '건강식']],

  // 아침 · 간편식
  ['스크램블에그 플레이트', 340, [{ name: '계란', qty: '3개' }, { name: '우유', qty: '2T' }, { name: '버터', qty: '10g' }, { name: '식빵', qty: '1장' }], true, '잘 익혀서', ['아침', '간편']],
  ['프렌치토스트', 420, [{ name: '식빵', qty: '2장' }, { name: '계란', qty: '2개' }, { name: '우유', qty: '50ml' }, { name: '버터', qty: '10g' }, { name: '메이플시럽', qty: '1T' }], true, '충분히 익혀서, 시럽 X', ['아침', '간편']],
  ['바나나 팬케이크', 360, [{ name: '바나나', qty: '2개' }, { name: '계란', qty: '2개' }, { name: '박력분', qty: '1/2컵' }, { name: '우유', qty: '50ml' }], true, '잘 익혀서 작게 잘라서', ['아침', '간편', '이유식']],

  // 아시안
  ['쌀국수', 460, [{ name: '쌀국수면', qty: '100g' }, { name: '소고기', qty: '100g' }, { name: '숙주', qty: '1줌' }, { name: '라임', qty: '1/2개' }, { name: '피시소스', qty: '1T' }], false, null, ['아시안', '면']],
  ['팟타이', 580, [{ name: '쌀국수면', qty: '100g' }, { name: '새우', qty: '8마리' }, { name: '숙주', qty: '1줌' }, { name: '계란', qty: '1개' }, { name: '땅콩', qty: '1T' }], false, null, ['아시안', '면', '태국']],

  // ── 101~160번: 마트 장보기 재료 활용 레시피 ─────────────────────────────
  // 돼지고기 (목심·삼겹살)
  ['돼지고기 두루치기', 610, [{ name: '돼지고기', qty: '300g' }, { name: '두부', qty: '1/2모' }, { name: '양파', qty: '1개' }, { name: '고추장', qty: '2T' }, { name: '대파', qty: '1대' }], false, null, ['한식', '볶음']],
  ['돼지목살 스테이크', 620, [{ name: '돼지고기', qty: '300g' }, { name: '마늘', qty: '5쪽' }, { name: '버터', qty: '15g' }, { name: '브로콜리', qty: '1/2개' }], false, null, ['구이', '양식']],
  ['고추장 목살구이', 640, [{ name: '돼지고기', qty: '300g' }, { name: '고추장', qty: '3T' }, { name: '상추', qty: '10장' }, { name: '마늘', qty: '5쪽' }], false, null, ['한식', '구이']],
  ['목살 수육', 580, [{ name: '돼지고기', qty: '400g' }, { name: '된장', qty: '2T' }, { name: '마늘', qty: '1통' }, { name: '상추', qty: '10장' }], false, null, ['한식', '수육']],
  ['돼지고기 카레라이스', 620, [{ name: '돼지고기', qty: '200g' }, { name: '카레가루', qty: '3T' }, { name: '감자', qty: '1개' }, { name: '당근', qty: '1/2개' }, { name: '양파', qty: '1개' }], true, '순한 카레로, 잘게 다져서', ['카레', '밥']],
  ['돼지고기 감자조림', 520, [{ name: '돼지고기', qty: '200g' }, { name: '감자', qty: '2개' }, { name: '간장', qty: '3T' }, { name: '대파', qty: '1대' }], true, '잘게 다지고 간 약하게', ['한식', '조림']],
  ['삼겹살 숙주볶음', 650, [{ name: '삼겹살', qty: '300g' }, { name: '숙주', qty: '2줌' }, { name: '마늘', qty: '3쪽' }, { name: '간장', qty: '1T' }], false, null, ['볶음', '한식']],
  ['김치 삼겹살볶음', 680, [{ name: '삼겹살', qty: '300g' }, { name: '김치', qty: '200g' }, { name: '양파', qty: '1/2개' }, { name: '대파', qty: '1대' }], false, null, ['한식', '볶음']],
  ['삼겹살 채소말이', 560, [{ name: '삼겹살', qty: '250g' }, { name: '파프리카', qty: '1개' }, { name: '버섯', qty: '100g' }, { name: '상추', qty: '8장' }], false, null, ['구이', '한식']],
  ['보쌈', 650, [{ name: '돼지고기', qty: '500g' }, { name: '된장', qty: '2T' }, { name: '배추', qty: '1/4포기' }, { name: '마늘', qty: '1통' }], false, null, ['한식', '수육']],

  // 소고기 (갈비살·불고기)
  ['갈비살 구이', 690, [{ name: '갈비살', qty: '300g' }, { name: '버섯', qty: '100g' }, { name: '상추', qty: '10장' }, { name: '마늘', qty: '5쪽' }], false, null, ['한식', '구이']],
  ['갈비살 버섯전골', 560, [{ name: '갈비살', qty: '200g' }, { name: '버섯', qty: '200g' }, { name: '두부', qty: '1/2모' }, { name: '대파', qty: '1대' }], true, '고기 잘게 찢어서', ['한식', '전골']],
  ['뚝배기 불고기', 590, [{ name: '불고기', qty: '250g' }, { name: '버섯', qty: '100g' }, { name: '당면', qty: '50g' }, { name: '대파', qty: '1대' }], true, '고기 잘게 다져서', ['한식', '전골']],
  ['불고기 덮밥', 620, [{ name: '불고기', qty: '200g' }, { name: '밥', qty: '1공기' }, { name: '양파', qty: '1/2개' }, { name: '계란', qty: '1개' }], true, '고기 잘게 다져서', ['한식', '덮밥']],
  ['불고기 버섯볶음', 570, [{ name: '불고기', qty: '250g' }, { name: '버섯', qty: '150g' }, { name: '파프리카', qty: '1개' }, { name: '대파', qty: '1대' }], false, null, ['한식', '볶음']],
  ['LA갈비구이', 700, [{ name: '소갈비', qty: '400g' }, { name: '간장', qty: '3T' }, { name: '배', qty: '1/4개' }, { name: '마늘', qty: '5쪽' }], false, null, ['한식', '구이']],

  // 두부·연두부
  ['두부 스테이크', 380, [{ name: '두부', qty: '1모' }, { name: '버섯', qty: '100g' }, { name: '양파', qty: '1/2개' }, { name: '간장', qty: '2T' }], true, '으깨서 부드럽게', ['건강식', '두부']],
  ['두부 버섯전골', 420, [{ name: '두부', qty: '1모' }, { name: '버섯', qty: '200g' }, { name: '애호박', qty: '1/2개' }, { name: '대파', qty: '1대' }], true, '두부 으깨서', ['한식', '전골']],
  ['연두부 샐러드', 240, [{ name: '연두부', qty: '1팩' }, { name: '방울토마토', qty: '8개' }, { name: '오이', qty: '1/2개' }, { name: '간장', qty: '1T' }, { name: '참기름', qty: '1t' }], true, '그대로 으깨서', ['샐러드', '건강식']],
  ['연두부 계란탕', 280, [{ name: '연두부', qty: '1팩' }, { name: '계란', qty: '2개' }, { name: '대파', qty: '1대' }, { name: '국간장', qty: '1T' }], true, '간 약하게', ['한식', '국']],

  // 토마토 (완숙·방울)
  ['토마토 달걀볶음밥', 520, [{ name: '토마토', qty: '2개' }, { name: '계란', qty: '2개' }, { name: '밥', qty: '1공기' }, { name: '대파', qty: '1대' }], true, '토마토 껍질 벗겨서', ['밥', '볶음']],
  ['토마토 스크램블', 340, [{ name: '토마토', qty: '1개' }, { name: '계란', qty: '3개' }, { name: '우유', qty: '2T' }, { name: '버터', qty: '10g' }], true, '잘 익혀서', ['아침', '간편']],
  ['토마토 수프', 280, [{ name: '토마토', qty: '3개' }, { name: '우유', qty: '200ml' }, { name: '버터', qty: '10g' }, { name: '양파', qty: '1/2개' }], true, '으깨서 그대로', ['수프', '아침']],
  ['토마토 카프레제', 320, [{ name: '토마토', qty: '2개' }, { name: '치즈', qty: '100g' }, { name: '올리브오일', qty: '2T' }, { name: '바질', qty: '약간' }], false, null, ['샐러드', '양식']],
  ['카프레제 파스타', 560, [{ name: '스파게티면', qty: '100g' }, { name: '토마토', qty: '2개' }, { name: '치즈', qty: '80g' }, { name: '올리브오일', qty: '2T' }], false, null, ['양식', '파스타']],
  ['방울토마토 마리네이드', 180, [{ name: '방울토마토', qty: '20개' }, { name: '올리브오일', qty: '3T' }, { name: '식초', qty: '1T' }, { name: '꿀', qty: '1T' }], false, null, ['샐러드', '반찬']],

  // 감자
  ['감자 그라탕', 450, [{ name: '감자', qty: '3개' }, { name: '우유', qty: '200ml' }, { name: '치즈', qty: '100g' }, { name: '버터', qty: '15g' }], true, '부드럽게 으깨서', ['양식', '오븐']],
  ['감자전', 320, [{ name: '감자', qty: '3개' }, { name: '부침가루', qty: '2T' }, { name: '소금', qty: '약간' }], true, '작게 부쳐서', ['한식', '전']],
  ['감자 달걀샐러드', 380, [{ name: '감자', qty: '2개' }, { name: '계란', qty: '2개' }, { name: '마요네즈', qty: '2T' }, { name: '오이', qty: '1/2개' }], true, '마요네즈 조금만', ['샐러드', '간편']],
  ['감자채볶음', 240, [{ name: '감자', qty: '2개' }, { name: '당근', qty: '1/4개' }, { name: '대파', qty: '1/2대' }, { name: '소금', qty: '약간' }], true, '부드럽게 볶아서', ['한식', '반찬']],

  // 애호박·버섯·채소
  ['애호박전', 280, [{ name: '애호박', qty: '1개' }, { name: '계란', qty: '2개' }, { name: '부침가루', qty: '3T' }], true, '작게 부쳐서', ['한식', '전']],
  ['애호박볶음', 180, [{ name: '애호박', qty: '1개' }, { name: '마늘', qty: '2쪽' }, { name: '대파', qty: '1/2대' }, { name: '참기름', qty: '1t' }], true, '부드럽게', ['한식', '반찬']],
  ['버섯볶음', 200, [{ name: '버섯', qty: '200g' }, { name: '마늘', qty: '3쪽' }, { name: '간장', qty: '1T' }, { name: '버터', qty: '10g' }], true, '잘게 다져서', ['한식', '반찬']],
  ['버섯 크림수프', 320, [{ name: '버섯', qty: '150g' }, { name: '우유', qty: '300ml' }, { name: '버터', qty: '15g' }, { name: '양파', qty: '1/4개' }], true, '으깨서 그대로', ['수프', '아침']],
  ['버섯 치즈오믈렛', 380, [{ name: '계란', qty: '3개' }, { name: '버섯', qty: '80g' }, { name: '치즈', qty: '50g' }, { name: '우유', qty: '2T' }], true, '잘 익혀서', ['아침', '간편']],
  ['파프리카 채소볶음', 220, [{ name: '파프리카', qty: '2개' }, { name: '버섯', qty: '100g' }, { name: '양파', qty: '1/2개' }, { name: '간장', qty: '1T' }], true, '잘게 다져서', ['볶음', '반찬']],
  ['채소 계란덮밥', 480, [{ name: '계란', qty: '3개' }, { name: '파프리카', qty: '1개' }, { name: '양파', qty: '1/2개' }, { name: '밥', qty: '1공기' }], true, '잘 익혀서', ['덮밥', '간편']],
  ['가지볶음', 200, [{ name: '가지', qty: '2개' }, { name: '마늘', qty: '2쪽' }, { name: '간장', qty: '1T' }, { name: '대파', qty: '1/2대' }], true, '부드럽게', ['한식', '반찬']],

  // 샐러드·무침
  ['양상추 샐러드', 180, [{ name: '양상추', qty: '1/2통' }, { name: '방울토마토', qty: '8개' }, { name: '오이', qty: '1/2개' }, { name: '올리브오일', qty: '2T' }], false, null, ['샐러드', '건강식']],
  ['오이무침', 90, [{ name: '오이', qty: '2개' }, { name: '고추가루', qty: '1T' }, { name: '식초', qty: '1T' }, { name: '마늘', qty: '1쪽' }], false, null, ['한식', '반찬']],
  ['상추겉절이', 110, [{ name: '상추', qty: '20장' }, { name: '고추가루', qty: '1T' }, { name: '간장', qty: '1T' }, { name: '참기름', qty: '1t' }], false, null, ['한식', '반찬']],
  ['오이 고추 된장무침', 100, [{ name: '오이', qty: '1개' }, { name: '고추', qty: '5개' }, { name: '된장', qty: '1T' }], false, null, ['한식', '반찬']],

  // 과일·유제품 (아침·간식)
  ['과일 플레이트', 200, [{ name: '수박', qty: '300g' }, { name: '자두', qty: '2개' }, { name: '복숭아', qty: '1개' }, { name: '블루베리', qty: '50g' }], true, '잘게 잘라서', ['아침', '과일']],
  ['수박 주스', 150, [{ name: '수박', qty: '400g' }], true, '씨 빼고 갈아서', ['음료', '여름']],
  ['복숭아 스무디', 240, [{ name: '복숭아', qty: '2개' }, { name: '우유', qty: '200ml' }, { name: '꿀', qty: '1T' }], true, '꿀 빼고', ['음료', '아침']],
  ['블루베리 우유 스무디', 250, [{ name: '블루베리', qty: '100g' }, { name: '우유', qty: '250ml' }, { name: '꿀', qty: '1T' }], true, '꿀 빼고', ['음료', '아침']],
  ['치즈 크래커 플레이트', 300, [{ name: '크래커', qty: '10개' }, { name: '치즈', qty: '80g' }, { name: '블루베리', qty: '50g' }, { name: '자두', qty: '1개' }], false, null, ['아침', '간편']],
  ['치즈토스트', 380, [{ name: '식빵', qty: '2장' }, { name: '치즈', qty: '60g' }, { name: '버터', qty: '10g' }, { name: '계란', qty: '1개' }], true, '잘 익혀서', ['아침', '간편']],

  // 생선·기타 한식
  ['생선구이 정식', 480, [{ name: '생선구이', qty: '1마리' }, { name: '밥', qty: '1공기' }, { name: '상추', qty: '5장' }, { name: '된장', qty: '1T' }], true, '가시 발라서', ['한식', '생선']],
  ['고등어조림', 460, [{ name: '고등어', qty: '1마리' }, { name: '무', qty: '1/4개' }, { name: '고추장', qty: '2T' }, { name: '대파', qty: '1대' }], false, null, ['한식', '생선', '조림']],
  ['계란국', 150, [{ name: '계란', qty: '2개' }, { name: '대파', qty: '1대' }, { name: '국간장', qty: '1T' }], true, '간 약하게', ['한식', '국']],
  ['청국장찌개', 420, [{ name: '청국장', qty: '200g' }, { name: '두부', qty: '1/2모' }, { name: '김치', qty: '100g' }, { name: '대파', qty: '1대' }], false, null, ['한식', '찌개']],
  ['오삼불고기', 620, [{ name: '오징어', qty: '1마리' }, { name: '삼겹살', qty: '200g' }, { name: '고추장', qty: '3T' }, { name: '양파', qty: '1개' }], false, null, ['한식', '볶음']],
  ['닭갈비', 640, [{ name: '닭', qty: '1/2마리' }, { name: '고구마', qty: '1개' }, { name: '양배추', qty: '1/4통' }, { name: '고추장', qty: '3T' }], false, null, ['한식', '볶음']],
  ['찜닭', 660, [{ name: '닭', qty: '1/2마리' }, { name: '감자', qty: '2개' }, { name: '당면', qty: '100g' }, { name: '간장', qty: '4T' }], true, '닭살 잘게 찢어서', ['한식', '찜']],
  ['훈제오리 채소볶음', 560, [{ name: '훈제오리', qty: '250g' }, { name: '파프리카', qty: '1개' }, { name: '양파', qty: '1/2개' }, { name: '부추', qty: '1줌' }], false, null, ['볶음', '한식']],
  ['밀푀유나베', 540, [{ name: '소고기', qty: '300g' }, { name: '배추', qty: '1/2포기' }, { name: '깻잎', qty: '20장' }, { name: '버섯', qty: '100g' }], false, null, ['일식', '전골']],
  ['유부초밥', 420, [{ name: '유부', qty: '10장' }, { name: '밥', qty: '1공기' }, { name: '당근', qty: '1/4개' }, { name: '참깨', qty: '약간' }], true, '작게 만들어서', ['간편', '분식']],
  ['주먹밥', 380, [{ name: '밥', qty: '1공기' }, { name: '참치통조림', qty: '1/2캔' }, { name: '김가루', qty: '2T' }, { name: '참기름', qty: '1t' }], true, '작게 뭉쳐서', ['간편', '분식']],
  ['냉모밀', 420, [{ name: '메밀면', qty: '150g' }, { name: '쯔유', qty: '100ml' }, { name: '무', qty: '약간' }, { name: '대파', qty: '약간' }], false, null, ['일식', '면', '여름']],

  // ── 추가 메뉴 (2026-07) — 반찬·전·이유식 죽·탕·일식·중식·양식·면 ──
  ['김치전', 380, [{ name: '배추김치', qty: '1컵' }, { name: '부침가루', qty: '1컵' }, { name: '물', qty: '1컵' }, { name: '대파', qty: '1대' }], false, null, ['한식', '전']],
  ['부추전', 320, [{ name: '부추', qty: '1단' }, { name: '부침가루', qty: '1컵' }, { name: '물', qty: '3/4컵' }, { name: '홍고추', qty: '1개' }], false, null, ['한식', '전']],
  ['동그랑땡', 420, [{ name: '다진돼지고기', qty: '200g' }, { name: '두부', qty: '1/2모' }, { name: '당근', qty: '1/3개' }, { name: '계란', qty: '2개' }], true, '간 없이 작게 부쳐 아기용으로', ['한식', '반찬']],
  ['우엉조림', 180, [{ name: '우엉', qty: '2대' }, { name: '간장', qty: '3T' }, { name: '물엿', qty: '2T' }, { name: '참깨', qty: '약간' }], false, null, ['한식', '반찬']],
  ['소고기 채소죽', 300, [{ name: '쌀', qty: '1/2컵' }, { name: '다진소고기', qty: '80g' }, { name: '애호박', qty: '1/4개' }, { name: '당근', qty: '1/4개' }], true, '이유식 중기~후기, 간 없이 곱게', ['죽', '이유식']],
  ['전복죽', 340, [{ name: '불린쌀', qty: '1컵' }, { name: '전복', qty: '3마리' }, { name: '참기름', qty: '1T' }, { name: '당근', qty: '1/4개' }], true, '전복 곱게 다져 후기 이유식', ['죽', '보양']],
  ['브로콜리 감자죽', 220, [{ name: '감자', qty: '1개' }, { name: '브로콜리', qty: '1/4송이' }, { name: '쌀', qty: '1/2컵' }, { name: '물', qty: '3컵' }], true, '초·중기 이유식, 곱게 으깨서', ['죽', '이유식']],
  ['호박죽', 260, [{ name: '늙은호박', qty: '300g' }, { name: '찹쌀가루', qty: '3T' }, { name: '팥', qty: '30g' }, { name: '소금', qty: '약간' }], true, '팥 빼고 호박만 곱게', ['죽', '간식']],
  ['감자탕', 620, [{ name: '돼지등뼈', qty: '500g' }, { name: '감자', qty: '2개' }, { name: '우거지', qty: '1줌' }, { name: '들깨가루', qty: '3T' }], false, null, ['한식', '탕']],
  ['대구탕', 380, [{ name: '대구', qty: '1/2마리' }, { name: '무', qty: '1/4개' }, { name: '미나리', qty: '1줌' }, { name: '두부', qty: '1/2모' }], false, null, ['생선', '탕']],
  ['알탕', 420, [{ name: '명란·곤이', qty: '200g' }, { name: '콩나물', qty: '1줌' }, { name: '미나리', qty: '1줌' }, { name: '고춧가루', qty: '2T' }], false, null, ['생선', '탕']],
  ['미소된장국', 120, [{ name: '미소된장', qty: '2T' }, { name: '두부', qty: '1/4모' }, { name: '미역', qty: '약간' }, { name: '대파', qty: '약간' }], true, '미소 소량, 두부만 으깨서', ['일식', '국']],
  ['어묵탕', 260, [{ name: '어묵', qty: '200g' }, { name: '무', qty: '1/4개' }, { name: '대파', qty: '1대' }, { name: '국간장', qty: '1T' }], true, '어묵 잘게, 국물만', ['한식', '탕']],
  ['오므라이스', 560, [{ name: '밥', qty: '1공기' }, { name: '계란', qty: '3개' }, { name: '양파', qty: '1/2개' }, { name: '닭고기', qty: '100g' }, { name: '케첩', qty: '3T' }], true, '계란·밥 부드럽게, 케첩 소량', ['양식', '밥']],
  ['가라아게', 520, [{ name: '닭다리살', qty: '300g' }, { name: '간장', qty: '2T' }, { name: '생강', qty: '약간' }, { name: '감자전분', qty: '4T' }], false, null, ['일식', '튀김']],
  ['규카츠', 640, [{ name: '소고기등심', qty: '250g' }, { name: '빵가루', qty: '1컵' }, { name: '계란', qty: '1개' }, { name: '양배추', qty: '1/4통' }], false, null, ['일식', '튀김']],
  ['텐동', 600, [{ name: '새우', qty: '4마리' }, { name: '튀김가루', qty: '1컵' }, { name: '밥', qty: '1공기' }, { name: '쯔유', qty: '3T' }], false, null, ['일식', '밥']],
  ['봉골레 파스타', 480, [{ name: '스파게티', qty: '180g' }, { name: '바지락', qty: '300g' }, { name: '마늘', qty: '4쪽' }, { name: '화이트와인', qty: '3T' }], false, null, ['양식', '파스타']],
  ['알리오 올리오', 460, [{ name: '스파게티', qty: '180g' }, { name: '마늘', qty: '6쪽' }, { name: '페페론치노', qty: '3개' }, { name: '올리브오일', qty: '4T' }], false, null, ['양식', '파스타']],
  ['로제 파스타', 620, [{ name: '펜네', qty: '180g' }, { name: '토마토소스', qty: '1컵' }, { name: '생크림', qty: '1/2컵' }, { name: '베이컨', qty: '50g' }], false, null, ['양식', '파스타']],
  ['감바스 알 아히요', 440, [{ name: '새우', qty: '200g' }, { name: '마늘', qty: '8쪽' }, { name: '올리브오일', qty: '1컵' }, { name: '바게트', qty: '1/2개' }], false, null, ['양식', '안주']],
  ['고추잡채', 460, [{ name: '돼지고기', qty: '200g' }, { name: '피망', qty: '3개' }, { name: '죽순', qty: '1/2컵' }, { name: '굴소스', qty: '2T' }], false, null, ['중식', '볶음']],
  ['깐풍기', 580, [{ name: '닭다리살', qty: '300g' }, { name: '전분', qty: '4T' }, { name: '건고추', qty: '4개' }, { name: '물엿', qty: '2T' }], false, null, ['중식', '튀김']],
  ['꿔바로우', 620, [{ name: '돼지등심', qty: '250g' }, { name: '감자전분', qty: '1컵' }, { name: '식초', qty: '3T' }, { name: '설탕', qty: '3T' }], false, null, ['중식', '튀김']],
  ['마라탕', 480, [{ name: '마라소스', qty: '3T' }, { name: '소고기', qty: '100g' }, { name: '청경채', qty: '1줌' }, { name: '목이버섯', qty: '1줌' }, { name: '당면', qty: '100g' }], false, null, ['중식', '탕']],
  ['비빔국수', 460, [{ name: '소면', qty: '200g' }, { name: '고추장', qty: '2T' }, { name: '오이', qty: '1/2개' }, { name: '계란', qty: '1개' }, { name: '식초', qty: '1T' }], false, null, ['한식', '면']],
  ['막국수', 420, [{ name: '메밀면', qty: '200g' }, { name: '열무김치', qty: '1컵' }, { name: '오이', qty: '1/2개' }, { name: '참기름', qty: '1T' }], false, null, ['한식', '면', '여름']],
  ['반미 샌드위치', 480, [{ name: '바게트', qty: '1개' }, { name: '돼지고기', qty: '120g' }, { name: '고수', qty: '약간' }, { name: '당근피클', qty: '1/2컵' }], false, null, ['아시안', '간편']],
  ['나시고랭', 540, [{ name: '밥', qty: '1공기' }, { name: '새우', qty: '6마리' }, { name: '계란', qty: '1개' }, { name: '양파', qty: '1/2개' }, { name: '케찹마니스', qty: '2T' }], false, null, ['아시안', '밥']],
  ['분짜', 500, [{ name: '쌀국수', qty: '150g' }, { name: '돼지고기', qty: '150g' }, { name: '느억맘', qty: '3T' }, { name: '상추', qty: '1줌' }], false, null, ['아시안', '면']],
];

async function seedRecipesIfEmpty(sqlite) {
  const { randomUUID } = await import('crypto');
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO recipes (id, name, kcal, ingredients, baby, baby_note, tags) VALUES (?,?,?,?,?,?,?)`,
  );
  const insertMany = sqlite.transaction((rows) => {
    let added = 0;
    for (const [name, kcal, ingredients, baby, baby_note, tags] of rows) {
      const { changes } = insert.run(randomUUID(), name, kcal, JSON.stringify(ingredients), baby ? 1 : 0, baby_note, JSON.stringify(tags));
      added += changes;
    }
    return added;
  });
  const added = insertMany(DEFAULT_RECIPES);
  if (added > 0) console.log(`[db] seeded ${added} new default recipes (${DEFAULT_RECIPES.length} total in catalog)`);
}

const db = await (USE_PG ? createPgAdapter() : createSqliteAdapter());
export default db;
