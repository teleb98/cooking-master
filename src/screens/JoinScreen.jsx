import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../context/FamilyContext';
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';
const PENDING_KEY = 'cookingMaster_pendingInvite';

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status });
  return body;
}

export default function JoinScreen() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { isAuthenticated } = useAuth();
  const { loadProfile }     = useFamily();

  const token = params.get('token');

  const [state, setState]   = useState('loading');  // loading | ready | error | accepting | done
  const [inviter, setInviter] = useState(null);
  const [errMsg, setErrMsg]   = useState('');

  // 토큰 검증
  useEffect(() => {
    if (!token) { setState('error'); setErrMsg('잘못된 초대 링크입니다.'); return; }
    apiFetch(`/invite?token=${token}`)
      .then(d => { setInviter(d.inviter); setState('ready'); })
      .catch(e => {
        setState('error');
        setErrMsg(
          e.message === 'already_used' ? '이미 사용된 초대 링크입니다.' :
          e.message === 'expired'      ? '만료된 초대 링크입니다. 새 링크를 요청하세요.' :
                                         '유효하지 않은 초대 링크입니다.'
        );
      });
  }, [token]);

  const accept = async () => {
    // 로그인 안 된 경우 → 토큰 저장 후 로그인 이동
    if (!isAuthenticated) {
      localStorage.setItem(PENDING_KEY, token);
      navigate('/login');
      return;
    }

    setState('accepting');
    try {
      const result = await apiFetch('/invite', {
        method: 'PUT',
        body: JSON.stringify({ token }),
      });
      await loadProfile();
      setInviter(prev => ({ ...prev, name: result.partner_name ?? prev?.name }));
      setState('done');
    } catch (e) {
      setState('error');
      setErrMsg(
        e.message === 'already_used' ? '이미 수락된 초대입니다.' :
        e.message === 'self_invite'  ? '본인의 초대 링크는 수락할 수 없습니다.' :
                                       '초대 수락 중 오류가 발생했습니다.'
      );
    }
  };

  // 로그인 후 pendingInvite 자동 수락
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = localStorage.getItem(PENDING_KEY);
    if (pending && pending === token && state === 'ready') {
      localStorage.removeItem(PENDING_KEY);
      accept();
    }
  }, [isAuthenticated, state]);  // eslint-disable-line

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
      paddingTop: 'env(safe-area-inset-top, 32px)',
    }}>
      {/* ── 로딩 ── */}
      {state === 'loading' && (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="var(--line)" strokeWidth="2.5"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
          </path>
        </svg>
      )}

      {/* ── 에러 ── */}
      {state === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: '#FEF2F0', color: '#C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            {Icon.warn(28)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>초대 링크 오류</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.65, marginBottom: 28 }}>{errMsg}</div>
          <button onClick={() => navigate('/')} style={{ padding: '13px 28px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
            홈으로 이동
          </button>
        </div>
      )}

      {/* ── 초대 확인 ── */}
      {(state === 'ready' || state === 'accepting') && inviter && (
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
          {/* 앱 아이콘 */}
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 24px var(--accent-alpha, rgba(200,101,74,0.3))' }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l1-5h16l1 5"/><path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2z"/>
              <path d="M8 19v2M16 19v2"/>
            </svg>
          </div>

          <div className="kr-en" style={{ marginBottom: 6 }}>Family invite · 가족 초대</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 8 }}>
            {inviter.name}님이 초대했어요
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.65, marginBottom: 32 }}>
            함께 식단을 관리하고 장보기 목록을 공유할 수 있어요.
          </div>

          {/* 기능 카드 */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', marginBottom: 28, textAlign: 'left' }}>
            {[
              { icon: Icon.calendar, text: '2주 식단을 함께 계획해요' },
              { icon: Icon.cart,     text: '장보기 목록을 자동으로 공유해요' },
              { icon: Icon.spark,    text: 'AI가 두 사람 취향을 모두 반영해요' },
            ].map(({ icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)' }}>
                <div style={{ color: 'var(--accent)', flexShrink: 0 }}>{icon(18)}</div>
                <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={accept}
            disabled={state === 'accepting'}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 14,
              background: state === 'accepting' ? 'var(--ink-4)' : 'var(--accent)',
              color: '#fff', fontSize: 15, fontWeight: 700,
              boxShadow: state === 'accepting' ? 'none' : '0 6px 18px rgba(200,101,74,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {state === 'accepting' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                </path>
              </svg>
            )}
            {!isAuthenticated ? '로그인하고 함께하기' : state === 'accepting' ? '연결 중…' : `${inviter.name}님과 함께하기`}
          </button>

          <button onClick={() => navigate('/')} style={{ marginTop: 12, width: '100%', padding: '12px 0', color: 'var(--ink-3)', fontSize: 13 }}>
            나중에 하기
          </button>
        </div>
      )}

      {/* ── 완료 ── */}
      {state === 'done' && (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(200,101,74,0.3)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
            연결됐어요! 🎉
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.65, marginBottom: 32 }}>
            {inviter?.name}님과 가족 식단을 함께 관리할 수 있어요.
          </div>
          <button onClick={() => navigate('/calendar')} style={{ width: '100%', padding: '15px 0', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700 }}>
            식단 캘린더 보기
          </button>
        </div>
      )}
    </div>
  );
}
