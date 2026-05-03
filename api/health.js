export default function handler(_req, res) {
  const hasDb = !!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  res.json({ ok: true, db: hasDb ? 'supabase' : 'missing', time: new Date().toISOString() });
}
