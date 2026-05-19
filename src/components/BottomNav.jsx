import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../icons';

const TABS = [
  { path: '/calendar', label: '식단',   icon: s => Icon.calendar(s) },
  { path: '/grocery',  label: '장보기',  icon: s => Icon.cart(s) },
  { path: '/recipes',  label: '레시피',  icon: s => Icon.book(s) },
  { path: '/profile',  label: '설정',   icon: s => Icon.settings(s) },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
      background: 'rgba(250,247,242,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--line)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      paddingTop: 8,
      zIndex: 50,
    }}>
      {TABS.map(tab => {
        const active = pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path, { replace: true })}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '6px 16px',
              color: active ? 'var(--accent)' : 'var(--ink-4)',
              transition: 'color 150ms',
            }}
          >
            {tab.icon(24)}
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.02em' }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
