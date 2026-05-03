import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

export default async function handler(req, res) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const userId = payload.userId;

  try {
    // GET /api/grocery?week_start=YYYY-MM-DD
    if (req.method === 'GET') {
      const { week_start } = req.query;
      if (!week_start) return res.status(400).json({ error: 'week_start required' });

      const { data, error } = await db.supabase
        .from('grocery_items')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', week_start)
        .order('category')
        .order('name');

      if (error) throw error;
      return res.json({ items: data ?? [] });
    }

    // PUT /api/grocery — toggle is_bought
    if (req.method === 'PUT') {
      const { id, is_bought } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const { error } = await db.supabase
        .from('grocery_items')
        .update({ is_bought: !!is_bought })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      return res.json({ ok: true });
    }

    // DELETE /api/grocery — remove item
    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const { error } = await db.supabase
        .from('grocery_items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[grocery]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
