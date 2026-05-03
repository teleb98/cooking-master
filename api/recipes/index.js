import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

export default async function handler(req, res) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { data, error } = await db.supabase
      .from('recipes')
      .select('name, kcal, baby, baby_note, tags')
      .order('name');

    if (error) throw error;
    res.json({ recipes: data ?? [] });
  } catch (err) {
    console.error('[recipes]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
