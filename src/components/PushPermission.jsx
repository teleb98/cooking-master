import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const VAPID_PUBLIC = 'BFNf01bQ3uPXwx8hPRTc4WJ9JzZnZWiZIXLZMlm2cwo4NaSmx05nwuNKqkkSaQ7jR933DuD4wPq5fLe3lHxZLfw';
const TOKEN_KEY    = 'cookingMaster_token';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export default function PushPermission() {
  const { isAuthenticated } = useAuth();
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'default') setShow(true);
  }, [isAuthenticated]);

  if (!show) return null;

  async function handleEnable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setShow(false); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });

      const token = localStorage.getItem(TOKEN_KEY);
      await fetch('/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ push_subscription: sub.toJSON() }),
      });
    } catch (err) {
      console.error('[PushPermission]', err);
    } finally {
      setLoading(false);
      setShow(false);
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--nav-h) + 12px + env(safe-area-inset-bottom, 0px))',
      left: 14, right: 14,
      background: 'var(--card)',
      borderRadius: 16,
      padding: '13px 14px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      zIndex: 500,
      border: '1px solid var(--line)',
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>식단 알림 받기</div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 1 }}>매일 저녁 오늘의 식단을 알려드려요</div>
      </div>
      <button
        onClick={() => setShow(false)}
        style={{ background: 'none', border: 'none', color: 'var(--ink2)', fontSize: 18, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
        aria-label="닫기"
      >
        ✕
      </button>
      <button
        onClick={handleEnable}
        disabled={loading}
        style={{
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 10,
          padding: '8px 14px', fontSize: 13, fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        {loading ? '…' : '설정'}
      </button>
    </div>
  );
}
