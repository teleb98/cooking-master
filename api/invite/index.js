import { db } from '../_db.js';
import { verifyToken } from '../_auth.js';

const APP_URL = process.env.APP_URL ?? 'https://cooking-master-tau.vercel.app';

export default async function handler(req, res) {
  try {
    // ── GET /api/invite?token=xxx ─────────────────────────────────
    // 공개 엔드포인트: 토큰 유효성 확인 + 초대자 정보 반환
    if (req.method === 'GET') {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: 'token required' });

      const { data: invite, error } = await db.supabase
        .from('invite_tokens')
        .select('*, users!invite_tokens_invited_by_fkey(name, email)')
        .eq('token', token)
        .single();

      if (error || !invite) return res.status(404).json({ error: 'Invalid invite link' });
      if (invite.accepted_at)  return res.status(410).json({ error: 'already_used' });
      if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

      return res.json({
        token,
        inviter: { name: invite.users?.name ?? '누군가', email: invite.users?.email },
        expires_at: invite.expires_at,
      });
    }

    // 이하: 인증 필요
    const payload = verifyToken(req);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });
    const userId = payload.userId;

    // ── POST /api/invite ──────────────────────────────────────────
    // 새 초대 링크 생성 (기존 미사용 토큰 재활용)
    if (req.method === 'POST') {
      // 기존 유효한 토큰 재사용
      const { data: existing } = await db.supabase
        .from('invite_tokens')
        .select('token, expires_at')
        .eq('invited_by', userId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        return res.json({
          token: existing.token,
          url:   `${APP_URL}/join?token=${existing.token}`,
          expires_at: existing.expires_at,
        });
      }

      // 새 토큰 발급
      const { data: invite, error } = await db.supabase
        .from('invite_tokens')
        .insert({ invited_by: userId })
        .select('token, expires_at')
        .single();

      if (error) throw error;
      return res.status(201).json({
        token: invite.token,
        url:   `${APP_URL}/join?token=${invite.token}`,
        expires_at: invite.expires_at,
      });
    }

    // ── PUT /api/invite ───────────────────────────────────────────
    // 초대 수락 (가족 그룹 연결)
    if (req.method === 'PUT') {
      const { token } = req.body ?? {};
      if (!token) return res.status(400).json({ error: 'token required' });

      const { data: invite, error: fetchErr } = await db.supabase
        .from('invite_tokens')
        .select('id, invited_by, accepted_at, expires_at')
        .eq('token', token)
        .single();

      if (fetchErr || !invite) return res.status(404).json({ error: 'Invalid token' });
      if (invite.accepted_at)  return res.status(409).json({ error: 'already_used' });
      if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });
      if (invite.invited_by === userId) return res.status(400).json({ error: 'self_invite' });

      // 수락 처리
      const { error: updateErr } = await db.supabase
        .from('invite_tokens')
        .update({ accepted_by: userId, accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      if (updateErr) throw updateErr;

      // 초대자 프로필에서 이름 조회 → 내 파트너 이름으로 저장
      const { data: inviterProfile } = await db.supabase
        .from('users')
        .select('name')
        .eq('id', invite.invited_by)
        .single();

      // 두 사용자 프로필 상호 연결
      await Promise.all([
        // 나(수락자)의 파트너 이름 업데이트
        db.supabase.from('user_profiles').upsert(
          { user_id: userId, partner_name: inviterProfile?.name ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ),
        // 초대자의 수락자 이름 조회 후 partner_name 업데이트
        (async () => {
          const { data: acceptorUser } = await db.supabase.from('users').select('name').eq('id', userId).single();
          await db.supabase.from('user_profiles').upsert(
            { user_id: invite.invited_by, partner_name: acceptorUser?.name ?? null, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        })(),
      ]);

      return res.json({ ok: true, partner_name: inviterProfile?.name ?? null });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[invite]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
