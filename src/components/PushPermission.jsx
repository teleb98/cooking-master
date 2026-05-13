import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const VAPID_PUBLIC = 'BFNf01bQ3uPXwx8hPRTc4WJ9JzZnZWiZIXLZMlm2cwo4NaSmx05nwuNKqkkSaQ7jR933DuD4wPq5fLe3lHxZLfw';
const TOKEN_KEY    = 'cookingMaster_token';
const DISMISS_KEY  = 'cm_push_dismissed';
const DISMISS_DAYS = 7;    // ✕ 눌렀을 때 재노출 억제 기간
const SHOW_DELAY   = 4000; // 앱 진입 후 노출 지연 (ms)
const AUTO_HIDE    = 8000; // 미응답 시 자동 숨김 (ms)

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export default function PushPermission() {
  const { isAuthenticated } = useAuth();
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);

  // ✕ 또는 "나중에" — DISMISS_DAYS 동안 재노출 억제
  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }, []);

  // 조건 충족 시 SHOW_DELAY 후 노출
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'default') return;

    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const daysSince = (Date.now() - Number(raw)) / 86_400_000;
      if (daysSince < DISMISS_DAYS) return;
    }

    const t = setTimeout(() => setShow(true), SHOW_DELAY);
    return () => clearTimeout(t);
  }, [isAuthenticated]);

  // AUTO_HIDE ms 후 자동 숨김 (localStorage 기록 없이 — 다음 세션에 다시 노출)
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), AUTO_HIDE);
    return () => clearTimeout(t);
  }, [show]);

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
    <>
      <style>{`
        @keyframes cmPushIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes cmPushProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 'calc(var(--nav-h) + 10px + env(safe-area-inset-bottom, 0px))',
          left: 14, right: 14,
          background: 'var(--card)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
          border: '1px solid var(--line)',
          zIndex: 490,
          animation: `cmPushIn 240ms cubic-bezier(0.34,1.56,0.64,1)`,
        }}
      >
        {/* 자동 닫힘 progress bar */}
        <div style={{
          height: 2,
          background: 'var(--accent)',
          opacity: 0.45,
          animation: `cmPushProgress ${AUTO_HIDE}ms linear forwards`,
        }} />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px 11px',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🔔</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', lineHeight: 1.3 }}>
              식단 알림 받기
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.3 }}>
              매일 저녁 오늘의 식단을 알려드려요
            </div>
          </div>

          <button
            onClick={dismiss}
            aria-label="닫기"
            style={{
              background: 'none', border: 'none',
              color: 'var(--ink2)', fontSize: 15,
              cursor: 'pointer', padding: '4px 6px',
              lineHeight: 1, flexShrink: 0,
              borderRadius: 6,
            }}
          >
            ✕
          </button>

          <button
            onClick={handleEnable}
            disabled={loading}
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 9,
              padding: '6px 13px', fontSize: 12.5, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              flexShrink: 0, lineHeight: 1.4,
            }}
          >
            {loading ? '…' : '설정'}
          </button>
        </div>
      </div>
    </>
  );
}
