import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import Icon from '../icons';

const TABS = [
  { path: '/calendar', label: '식단',  labelEn: 'Meal Plan', icon: s => Icon.calendar(s) },
  { path: '/grocery',  label: '장보기', labelEn: 'Grocery',   icon: s => Icon.cart(s) },
  { path: '/fridge',   label: '냉장고', labelEn: 'Fridge',    icon: s => Icon.fridge(s) },
  { path: '/recipes',  label: '레시피', labelEn: 'Recipes',   icon: s => Icon.book(s) },
  { path: '/profile',  label: '설정',  labelEn: 'Settings',  icon: s => Icon.settings(s) },
];

export default function SideNav() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const { accent, setChatOpen } = useApp();
  const { user }     = useAuth();

  const navItem = (tab) => {
    const active = pathname === tab.path;
    return (
      <button
        key={tab.path}
        onClick={() => navigate(tab.path, { replace: true })}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '11px 14px', borderRadius: 12,
          marginBottom: 2,
          background: active ? accent + '1A' : 'transparent',
          color: active ? accent : 'var(--ink-2)',
          transition: 'background 150ms, color 150ms',
          textAlign: 'left',
        }}
      >
        <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>{tab.icon(20)}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: active ? 700 : 500, lineHeight: 1.3 }}>{tab.label}</div>
          <div style={{ fontSize: 10, color: active ? accent + 'AA' : 'var(--ink-4)', letterSpacing: '0.05em', lineHeight: 1.2 }}>{tab.labelEn}</div>
        </div>
        {active && (
          <div style={{
            marginLeft: 'auto', width: 4, height: 28,
            borderRadius: 2, background: accent, flexShrink: 0,
          }} />
        )}
      </button>
    );
  };

  return (
    <nav style={{
      width: 240, height: '100%', flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)',
      borderRight: '1px solid var(--line)',
    }}>

      {/* ── 로고 ─────────────────────────────── */}
      <div style={{ padding: '28px 20px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: accent, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l1-5h16l1 5"/>
            <path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2z"/>
            <path d="M8 19v2M16 19v2"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>Cooking</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: accent, lineHeight: 1.2 }}>Master</div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--line-soft)', margin: '0 14px 10px' }} />

      {/* ── 내비게이션 ─────────────────────── */}
      <div style={{ flex: 1, padding: '0 10px', overflowY: 'auto' }}>
        {TABS.map(navItem)}

        <div style={{ margin: '14px 4px 10px', height: 1, background: 'var(--line-soft)' }} />

        {/* AI 채팅 */}
        <button
          onClick={() => setChatOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '11px 14px', borderRadius: 12,
            background: accent + '1A', color: accent, textAlign: 'left',
          }}
        >
          <span style={{ flexShrink: 0 }}>{Icon.spark(20)}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>AI 식단 도우미</div>
            <div style={{ fontSize: 10, color: accent + 'AA', letterSpacing: '0.05em', lineHeight: 1.2 }}>Meal AI Chat</div>
          </div>
        </button>
      </div>

      {/* ── 사용자 정보 ────────────────────── */}
      {user && (
        <div style={{
          padding: '14px 16px 22px',
          borderTop: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: accent + '22', color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
          }}>
            {(user.name ?? user.email ?? '?')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name ?? '사용자'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
