import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppProvider, useApp }       from './context/AppContext';
import { AuthProvider, useAuth }     from './context/AuthContext';
import { FamilyProvider }            from './context/FamilyContext';
import BottomNav         from './components/BottomNav';
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

function AppShell() {
  const { accent, onboarded, theme } = useApp();
  const { isAuthenticated, authLoading } = useAuth();

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  }, [theme]);

  if (authLoading) return <GlobalLoader />;

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        <WelcomeToast />
        <Routes>
          {/* ── Smart home: auto-route by auth + onboarding state ── */}
          <Route path="/" element={
            !isAuthenticated                                                    ? <WelcomeScreen />                     :
            !onboarded && !localStorage.getItem('cookingMaster_onboarded')     ? <Navigate to="/onboarding" replace /> :
                                                                                  <Navigate to="/calendar" replace />
          } />

          {/* ── Calendar (no onboarding guard — navigate here directly after onboarding) ── */}
          <Route path="/calendar" element={<RequireAuth><CalendarScreen /></RequireAuth>} />

          {/* ── Public (redirect to / if already logged in) ── */}
          <Route path="/welcome" element={isAuthenticated ? <Navigate to="/" replace /> : <WelcomeScreen />} />
          <Route path="/login"   element={isAuthenticated ? <Navigate to="/" replace /> : <LoginScreen />} />

          {/* ── Protected ── */}
          <Route path="/onboarding" element={<RequireAuth><OnboardingScreen /></RequireAuth>} />
          <Route path="/grocery"    element={<RequireAuth><GroceryScreen /></RequireAuth>} />
          <Route path="/recipes"    element={<RequireAuth><RecipeScreen /></RequireAuth>} />
          <Route path="/profile"    element={<RequireAuth><ProfileScreen /></RequireAuth>} />

          {/* ── 가족 초대 수락 (공개) ── */}
          <Route path="/join" element={<JoinScreen />} />

          {/* ── Public static pages ── */}
          <Route path="/privacy"       element={<PrivacyScreen />} />
          <Route path="/data-deletion" element={<DataDeletionScreen />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <ChatSheet />
      <RecipeSheet />
      <FavoritesSheet />
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
