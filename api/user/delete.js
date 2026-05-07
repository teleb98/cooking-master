import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const uid = payload.userId;

  try {
    // Delete all user data in dependency order
    await Promise.all([
      db.supabase.from('meal_plans').delete().eq('user_id', uid),
      db.supabase.from('grocery_items').delete().eq('user_id', uid),
    ]);

    await db.supabase.from('user_profiles').delete().eq('user_id', uid);
    await db.supabase.from('users').delete().eq('id', uid);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[user/delete]', err.message);
    return res.status(500).json({ error: '계정 삭제 중 오류가 발생했습니다.' });
  }
}
