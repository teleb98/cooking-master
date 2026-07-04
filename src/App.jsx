import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppProvider, useApp }       from './context/AppContext';
import { AuthProvider, useAuth }     from './context/AuthContext';
import { FamilyProvider }            from './context/FamilyContext';
import BottomNav         from './components/BottomNav';
import SideNav           from './components/SideNav';
import { useDesktop }    from './hooks/useDesktop';
import WelcomeScreen     from './screens/WelcomeScreen';
import LoginScreen       from './screens/LoginScreen';
import CalendarScreen    from './screens/CalendarScreen';
import GroceryScreen     from './screens/GroceryScreen';
import OnboardingScreen  from './screens/OnboardingScreen';
import ProfileScreen     from './screens/ProfileScreen';
import ChatSheet         from './screens/ChatSheet';
import RecipeSheet       from './screens/RecipeSheet';
import FavoritesSheet    from './screens/FavoritesSheet';
import InstallBanner     from './components/InstallBanner';
import UpgradeSheet     from './components/UpgradeSheet';
import RecipeScreen      from './screens/RecipeScreen';
import PrivacyScreen     from './screens/PrivacyScreen';
import DataDeletionScreen from './screens/DataDeletionScreen';
import JoinScreen        from './screens/JoinScreen';

function RequireAuth({ children }) {
  const { isAuthenticated, authLoading } = useAuth();
  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function GlobalLoader() {
  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', gap: 20,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 18, background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l1-5h16l1 5"/>
          <path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2z"/>
          <path d="M8 19v2M16 19v2"/>
        </svg>
      </div>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="var(--line)" strokeWidth="2.5"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
        </path>
      </svg>
    </div>
  );
}

/* ── 로그인 성공 후 환영 토스트 ─────────────────────────── */
function WelcomeToast() {
  const [toast, setToast] = useState(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    const raw = sessionStorage.getItem('cm_welcome');
    if (!raw) return;
    sessionStorage.removeItem('cm_welcome');
    try {
      const { name, isNew } = JSON.parse(raw);
      setToast({ name, isNew });
      const t = setTimeout(() => setToast(null), 2800);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [isAuthenticated]);

  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      left: '50%', transform: 'translateX(-50%)',
      background: 'var(--ink)', color: '#fff',
      padding: '12px 22px', borderRadius: 14,
      fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap',
      boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
      zIndex: 999,
      animation: 'toastIn 280ms cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {toast.isNew ? `🎉 환영해요, ${toast.name}님!` : `👋 반가워요, ${toast.name}님!`}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.92); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1); }
        }
      `}</style>
    </div>
  );
}

function GlobalToast() {
  const { toast } = useApp();
  if (!toast) return null;
  const isSuccess = toast.type === 'success';
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      background: isSuccess ? '#27AE60' : '#C0392B',
      color: '#fff', padding: '11px 20px', borderRadius: 12,
      fontSize: 13, fontWeight: 600, zIndex: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      whiteSpace: 'nowrap',
      animation: 'toastIn 250ms cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {toast.msg}
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px) scale(0.92); } to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }`}</style>
    </div>
  );
}

const HIDE_NAV = ['/welcome', '/login', '/onboarding', '/join', '/'];

const SHOW_SIDEBAR = ['/calendar', '/grocery', '/recipes', '/profile'];

function AppShell() {
  const { accent, onboarded, theme } = useApp();
  const { isAuthenticated, authLoading } = useAuth();
  const isDesktop = useDesktop();
  const { pathname } = useLocation();
  const showSidebar = isDesktop && isAuthenticated && SHOW_SIDEBAR.includes(pathname);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  }, [theme]);

  if (authLoading) return <GlobalLoader />;

  const routes = (
    <Routes>
      <Route path="/" element={
        !isAuthenticated                                                    ? <WelcomeScreen />                     :
        !onboarded && !localStorage.getItem('cookingMaster_onboarded')     ? <Navigate to="/onboarding" replace /> :
                                                                              <Navigate to="/calendar" replace />
      } />
      <Route path="/calendar" element={<RequireAuth><CalendarScreen /></RequireAuth>} />
      <Route path="/welcome"  element={isAuthenticated ? <Navigate to="/" replace /> : <WelcomeScreen />} />
      <Route path="/login"    element={isAuthenticated ? <Navigate to="/" replace /> : <LoginScreen />} />
      <Route path="/onboarding"    element={<RequireAuth><OnboardingScreen /></RequireAuth>} />
      <Route path="/grocery"       element={<RequireAuth><GroceryScreen /></RequireAuth>} />
      <Route path="/recipes"       element={<RequireAuth><RecipeScreen /></RequireAuth>} />
      <Route path="/profile"       element={<RequireAuth><ProfileScreen /></RequireAuth>} />
      <Route path="/join"          element={<JoinScreen />} />
      <Route path="/privacy"       element={<PrivacyScreen />} />
      <Route path="/data-deletion" element={<DataDeletionScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  /* ── 데스크톱 레이아웃 ─────────────────────────────────── */
  if (isDesktop) {
    return (
      <div style={{
        height: '100dvh', overflow: 'hidden',
        display: 'flex', background: 'var(--bg-2)',
        justifyContent: 'center',
      }}>
        {/* 앱 프레임: 최대 너비 제한 */}
        <div style={{
          display: 'flex', width: '100%', maxWidth: 1440,
          height: '100%', background: 'var(--bg)',
          boxShadow: '0 0 0 1px var(--line)',
        }}>
          {/* 사이드바: 인증된 메인 화면에서만 표시 */}
          {showSidebar && <SideNav />}

          {/* 콘텐츠 영역 */}
          <div style={{
            flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden',
            position: 'relative',
          }}>
            <WelcomeToast />
            {routes}
          </div>
        </div>

        <ChatSheet />
        <RecipeSheet />
        <FavoritesSheet />
        <UpgradeSheet />
        <GlobalToast />
      </div>
    );
  }

  /* ── 모바일 레이아웃 (기존) ────────────────────────────── */
  return (
    <div style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        <WelcomeToast />
        {routes}
      </div>

      <ChatSheet />
      <RecipeSheet />
      <FavoritesSheet />
      <UpgradeSheet />
      <InstallBanner />
      <GlobalToast />

      <Routes>
        {HIDE_NAV.map(p => <Route key={p} path={p} element={null} />)}
        <Route path="*" element={<BottomNav />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FamilyProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </FamilyProvider>
    </AuthProvider>
  );
}
