import { db } from '../_db.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PROJECT_REF  = SUPABASE_URL.replace('https://', '').split('.')[0];

async function runSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-reset-secret'] !== 'cooking-reset-2026') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = {};

  // Delete child tables first (FK order), then parent
  const deletes = [
    ['grocery_items', 'user_id'],
    ['meal_plans',    'user_id'],
    ['user_profiles', 'user_id'],
    ['users',         'id'],
  ];

  for (const [table, col] of deletes) {
    const { error } = await db.supabase
      .from(table)
      .delete()
      .neq(col, '00000000-0000-0000-0000-000000000000');
    results[`delete_${table}`] = error ? `error: ${error.message}` : 'ok';
  }

  // Add baby_name column via Supabase Management API
  const migration = await runSQL(
    'ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS baby_name varchar(100) DEFAULT NULL;'
  );
  results.add_baby_name = migration.ok ? 'ok' : `failed: ${JSON.stringify(migration.body)}`;

  return res.json({ ok: true, results });
}
