import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { db } from '../_db.js';
import { signToken } from '../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { access_token } = req.body ?? {};
  if (!access_token) return res.status(400).json({ error: 'Missing access_token' });

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Verify token and get user info from Supabase
    const { data: { user }, error } = await supabase.auth.getUser(access_token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    const provider = 'google';
    const identity = user.identities?.find((i) => i.provider === 'google');
    const provider_id = `google_${identity?.id ?? user.id}`;
    const name =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split('@')[0] ??
      'Google User';
    const email = user.email ?? null;
    const avatar_url =
      user.user_metadata?.avatar_url ??
      user.user_metadata?.picture ??
      null;

    // Upsert into our public.users table
    const existing = await db.getOne('users', { provider, provider_id });
    let dbUser;
    if (existing) {
      await db.update('users', { id: existing.id }, {
        name,
        email,
        avatar_url: avatar_url ?? existing.avatar_url,
        last_login_at: new Date().toISOString(),
      });
      dbUser = await db.getOne('users', { id: existing.id });
    } else {
      dbUser = await db.insert('users', {
        id: randomUUID(),
        provider,
        provider_id,
        name,
        email: email ?? null,
        avatar_url: avatar_url ?? null,
      });
    }

    res.json({
      token:  signToken(dbUser.id),
      user:   dbUser,
      is_new: !existing,
    });
  } catch (err) {
    console.error('[supabase-callback]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
