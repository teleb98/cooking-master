import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const DISMISSED_KEY = 'cm_install_dismissed';

export default function InstallBanner() {
  const { accent } = useApp();
  const [prompt, setPrompt]       = useState(null);
  const [visible, setVisible]     = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = e => {
      e.preventDefault();
      setPrompt(e);
      // 앱 로드 후 3초 뒤 배너 표시 (너무 빠르면 UX 방해)
      setTimeout(() => setVisible(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // 이미 설치된 경우 배너 숨김
    window.addEventListener('appinstalled', () => setVisible(false));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    setInstalling(true);
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setInstalling(false);
    if (outcome === 'accepted') {
      setVisible(false);
    } else {
      setPrompt(null);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible || !prompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--nav-h, 60px) + env(safe-area-inset-bottom, 0px) + 10px)',
      left: 12, right: 12,
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 18,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 500,
      animation: 'installSlideUp 320ms cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <style>{`
        @keyframes installSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      {/* 아이콘 */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l1-5h16l1 5"/>
          <path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2z"/>
          <path d="M8 19v2M16 19v2"/>
        </svg>
      </div>

      {/* 텍스트 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
          홈 화면에 추가
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
          앱처럼 빠르게 실행돼요
        </div>
      </div>

      {/* 버튼들 */}
      <button
        onClick={handleDismiss}
        style={{ color: 'var(--ink-4)', padding: '6px 8px', fontSize: 12, fontWeight: 600 }}
      >
        나중에
      </button>
      <button
        onClick={handleInstall}
        disabled={installing}
        style={{
          padding: '8px 16px', borderRadius: 10, flexShrink: 0,
          background: accent, color: '#fff',
          fontSize: 13, fontWeight: 700,
          boxShadow: `0 4px 12px ${accent}55`,
        }}
      >
        {installing ? '설치 중…' : '추가'}
      </button>
    </div>
  );
}
