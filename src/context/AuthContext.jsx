import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'cookingMaster_token';

// rarebook 통합 SSO — www(허브)에서 로그인하면 .rarebook.co.kr 쿠키(rb_session)가 공유된다.
export const HUB_LOGIN = (next = (typeof window !== 'undefined' ? window.location.href : '')) =>
  `https://rarebook.co.kr/member/login?next=${encodeURIComponent(next)}`;

function hasRbCookie() {
  return typeof document !== 'undefined' && /(?:^|;\s*)rb_session=/.test(document.cookie);
}
function clearRbCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'rb_session=; Domain=.rarebook.co.kr; Path=/; Max-Age=0; SameSite=Lax';
  document.cookie = 'rb_session=; Path=/; Max-Age=0';
}

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session — 자체 Bearer 토큰 또는 rarebook SSO 쿠키(rb_session) 중 하나로 복원
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const hasSso = hasRbCookie();
    if (!token && !hasSso) { setAuthLoading(false); return; }

    apiFetch('/user/profile')
      .then(data => setUser(data.user))
      .catch(async () => {
        // Bearer 토큰이 만료/무효인데 SSO 쿠키가 있으면 쿠키로 재시도
        if (token && hasSso) {
          localStorage.removeItem(TOKEN_KEY);
          try { const d = await apiFetch('/user/profile'); setUser(d.user); return; } catch { /* fallthrough */ }
        }
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // Called after OAuth callback: stores token, fetches user
  const loginWithToken = useCallback(async (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    const data = await apiFetch('/user/profile');
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    clearRbCookie(); // 통합 로그아웃: 공유 SSO 쿠키 제거
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loginWithToken, logout, isAuthenticated: !!user, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
