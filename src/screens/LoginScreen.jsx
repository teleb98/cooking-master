import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

/* ── 소셜 로그인 공급자 아이콘 ──────────────────────────────── */
function GoogleIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
function KakaoIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#000000">
      <path d="M12 3C6.477 3 2 6.701 2 11.284c0 2.905 1.8 5.463 4.54 6.978L5.6 22l4.373-2.893A12.74 12.74 0 0 0 12 19.57c5.523 0 10-3.701 10-8.286C22 6.7 17.523 3 12 3z"/>
    </svg>
  );
}
function NaverIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
      <path d="M16.42 12.78L7.18 0H0v24h7.58V11.22L16.82 24H24V0h-7.58v12.78z"/>
    </svg>
  );
}
function FacebookIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}

/* ── 공급자 정의 ─────────────────────────────────────────── */
const PROVIDERS = [
  { id: 'kakao',    label: '카카오로 로그인',    bg: '#FEE500', color: '#000000', border: 'transparent', Icon: KakaoIcon },
  { id: 'naver',    label: '네이버로 로그인',    bg: '#03C75A', color: '#FFFFFF', border: 'transparent', Icon: NaverIcon },
  { id: 'google',   label: 'Google로 로그인',    bg: '#FFFFFF', color: '#3C4043', border: '#DADCE0',     Icon: GoogleIcon },
  { id: 'facebook', label: 'Facebook으로 로그인', bg: '#1877F2', color: '#FFFFFF', border: 'transparent', Icon: FacebookIcon },
];

const ERROR_MSGS = {
  not_configured: '해당 로그인은 현재 준비 중입니다.',
  auth_failed:    '로그인에 실패했습니다. 다시 시도해주세요.',
  state_mismatch: '보안 오류가 발생했습니다. 다시 시도해주세요.',
  access_denied:  '로그인이 취소되었습니다.',
  invalid_request: '잘못된 요청입니다. 다시 시도해주세요.',
};

function Spinner({ color = '#fff' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeOpacity="0.3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
      </path>
    </svg>
  );
}

/* ── 에러 배너 ───────────────────────────────────────────── */
function ErrorBanner({ msg, onClose }) {
  return (
    <div style={{
      margin: '0 0 12px',
      padding: '12px 16px',
      borderRadius: 12,
      background: '#FFF0ED',
      border: '1px solid #FBBCAC',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8654A" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span style={{ flex: 1, fontSize: 13, color: '#8B3A2A', lineHeight: 1.5 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#C8654A', lineHeight: 1 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────── */
export default function LoginScreen() {
  const { loginWithToken } = useAuth();
  const { markOnboarded } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [errorMsg, setErrorMsg] = useState(null);
  const [loadingProvider, setLoadingProvider] = useState(null);
  // { google: true, kakao: false, ... } — null means still loading
  const [configured, setConfigured] = useState(null);

  const callbackHandled = useRef(false);
  const from = location.state?.from ?? '/';

  // ── 1. OAuth 공급자 설정 상태 조회 ────────────────────────
  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured ?? {}))
      .catch(() => setConfigured({})); // fail open — let user try
  }, []);

  // ── 2. OAuth 콜백 처리 ────────────────────────────────────
  useEffect(() => {
    if (callbackHandled.current) return;

    // Success: token in hash fragment (all providers)
    if (window.location.hash.includes('token=')) {
      callbackHandled.current = true;
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const token = hash.get('token');

      if (token) {
        window.history.replaceState({}, '', window.location.pathname);
        const name = decodeURIComponent(hash.get('name') ?? '');
        const isNew = hash.get('is_new') === 'true';

        sessionStorage.setItem('cm_welcome', JSON.stringify({ name: name || '사용자', isNew }));

        if (!isNew) markOnboarded();

        loginWithToken(token).catch(() => {
          setErrorMsg('로그인에 실패했습니다. 다시 시도해주세요.');
        });
        return;
      }
    }

    // Error: query params
    if (window.location.search) {
      callbackHandled.current = true;
      const params = new URLSearchParams(window.location.search);
      const error = params.get('error');
      if (error) {
        window.history.replaceState({}, '', window.location.pathname);
        setErrorMsg(ERROR_MSGS[error] ?? '로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 버튼 클릭 ────────────────────────────────────────────
  const handleClick = (providerId) => {
    if (loadingProvider) return;
    setErrorMsg(null);
    setLoadingProvider(providerId);
    window.location.href = `/api/auth/oauth?provider=${providerId}`;
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>

      {/* 앱 아이콘 + 타이틀 */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 28px 20px',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: 'var(--accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 32px rgba(200,101,74,0.35)',
          marginBottom: 22,
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l1-5h16l1 5"/>
            <path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2z"/>
            <path d="M8 19v2M16 19v2"/>
            <path d="M9 3c0-1 1-2 2-2s2 1 2 2-1 2-2 2"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
          로그인 / 회원가입
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 8, textAlign: 'center', lineHeight: 1.65 }}>
          소셜 계정으로 간편하게 시작하세요.<br/>
          처음 로그인하면 계정이 자동으로 생성됩니다.
        </p>
      </div>

      {/* 소셜 로그인 버튼 */}
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 에러 배너 */}
        {errorMsg && <ErrorBanner msg={errorMsg} onClose={() => setErrorMsg(null)} />}

        {PROVIDERS.map((p) => {
          const isConfigured = configured === null ? null : (configured[p.id] ?? false);
          const isLoading = loadingProvider === p.id;
          const isDisabled = !!loadingProvider;
          const notReady = isConfigured === false;

          return (
            <button
              key={p.id}
              onClick={() => !notReady && handleClick(p.id)}
              disabled={isDisabled}
              style={{
                width: '100%', height: 54, borderRadius: 14,
                background: notReady ? 'var(--surface)' : p.bg,
                color: notReady ? 'var(--ink-3)' : p.color,
                border: `1.5px solid ${notReady ? 'var(--line)' : p.border}`,
                fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: isDisabled && !isLoading ? 0.4 : 1,
                transition: 'opacity 200ms, transform 100ms',
                transform: isLoading ? 'scale(0.98)' : 'scale(1)',
                cursor: notReady || isDisabled ? 'default' : 'pointer',
                boxShadow: !notReady && p.bg === '#FFFFFF' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                position: 'relative',
              }}
            >
              {isLoading ? (
                <Spinner color={p.color} />
              ) : notReady ? (
                // provider icon in muted style
                <span style={{ opacity: 0.35 }}>
                  <p.Icon size={20} />
                </span>
              ) : (
                <p.Icon size={20} />
              )}

              <span>{notReady ? p.label.replace('로 로그인', '') : p.label}</span>

              {/* 상태 뱃지 */}
              {configured === null && (
                <span style={{
                  position: 'absolute', right: 14,
                  width: 8, height: 8, borderRadius: '50%',
                  background: notReady ? 'transparent' : p.bg === '#FFFFFF' ? '#DADCE0' : 'rgba(255,255,255,0.35)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}/>
              )}
              {notReady && (
                <span style={{
                  position: 'absolute', right: 14,
                  fontSize: 10, padding: '2px 8px', borderRadius: 6,
                  background: 'var(--bg-2)', color: 'var(--ink-4)', fontWeight: 600,
                }}>
                  준비 중
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 이용약관 */}
      <p style={{
        fontSize: 11, color: 'var(--ink-4)', textAlign: 'center',
        padding: '16px 32px calc(16px + env(safe-area-inset-bottom, 0px))',
        lineHeight: 1.7, margin: 0,
      }}>
        로그인하면 Cooking Master의{' '}
        <span style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>이용약관</span>
        {' '}및{' '}
        <span style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>개인정보 처리방침</span>
        에 동의하는 것으로 간주됩니다.
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
