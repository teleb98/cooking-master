import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
// Service role key required — bypasses RLS and has full DB access.
// Never fall back to anon key: anon key + no RLS = full public access.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Thin wrapper so the route files keep a clean query interface.
 * All methods throw on Supabase errors so callers can catch uniformly.
 */
export const db = {
  supabase,

  /** Returns first matching row or null */
  async getOne(table, filters = {}) {
    let q = supabase.from(table).select('*');
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Returns all matching rows */
  async getMany(table, filters = {}, order = null) {
    let q = supabase.from(table).select('*');
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    if (order) q = q.order(order.col, { ascending: order.asc ?? false });
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  /** Insert a row */
  async insert(table, row) {
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  },

  /** Update rows matching filters */
  async update(table, filters, updates) {
    let q = supabase.from(table).update(updates);
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    const { error } = await q;
    if (error) throw error;
  },

  /** Upsert — insert or update on conflict */
  async upsert(table, row, conflictCols) {
    const { data, error } = await supabase
      .from(table)
      .upsert(row, { onConflict: conflictCols })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export function fmt(v) {
  return v instanceof Date ? v.toISOString() : (v ?? null);
}
