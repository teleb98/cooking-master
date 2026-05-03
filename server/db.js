/**
 * DB adapter — SQLite (local dev) or PostgreSQL (production via DATABASE_URL)
 * Unified async interface: getOne / getMany / run
 * Param style: always use $1 $2 … (converted to ? for SQLite internally)
 */

const USE_PG = !!process.env.DATABASE_URL;

// ── PostgreSQL ──────────────────────────────────────────
async function createPgAdapter() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  await pool.query(`
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
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      family_type   TEXT    NOT NULL DEFAULT 'couple',
      baby_birthday TEXT,
      shopping_day  INTEGER NOT NULL DEFAULT 6,
      partner_name  TEXT,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

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
  const sqlite = new Database(join(__dir, 'cooking-master.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
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
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      family_type   TEXT    NOT NULL DEFAULT 'couple',
      baby_birthday TEXT,
      shopping_day  INTEGER NOT NULL DEFAULT 6,
      partner_name  TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // $1 $2 … → ?
  const toSQLite = sql => sql.replace(/\$\d+/g, '?');

  console.log('[db] connected to SQLite (local dev)');
  return {
    getOne:  (sql, p = []) => sqlite.prepare(toSQLite(sql)).get(...p) ?? null,
    getMany: (sql, p = []) => sqlite.prepare(toSQLite(sql)).all(...p),
    run:     (sql, p = []) => { sqlite.prepare(toSQLite(sql)).run(...p); },
  };
}

const db = await (USE_PG ? createPgAdapter() : createSqliteAdapter());
export default db;
