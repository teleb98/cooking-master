import { useBackHandler } from '../hooks/useBackHandler';
import { useDesktop } from '../hooks/useDesktop';
import Icon from '../icons';

// Slide-up bottom sheet (mobile) / centered dialog (desktop)
export function Sheet({ open, onClose, title, subtitle, children }) {
  useBackHandler(open, onClose);
  const isDesktop = useDesktop();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: open ? 'auto' : 'none',
        background: open ? 'rgba(20,16,12,0.45)' : 'transparent',
        transition: 'background 240ms ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: isDesktop ? 'center' : 'flex-end',
        alignItems: isDesktop ? 'center' : undefined,
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: isDesktop ? 20 : '20px 20px 0 0',
          height: isDesktop ? 'min(82vh, 720px)' : '82%',
          width: isDesktop ? 'min(660px, 90vw)' : '100%',
          display: 'flex', flexDirection: 'column',
          transform: open
            ? 'translateY(0) scale(1)'
            : isDesktop ? 'translateY(12px) scale(0.97)' : 'translateY(100%)',
          opacity: isDesktop ? (open ? 1 : 0) : 1,
          transition: isDesktop
            ? 'transform 260ms cubic-bezier(.2,.8,.2,1), opacity 220ms'
            : 'transform 300ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: 'var(--shadow-lg)',
          paddingBottom: isDesktop ? 0 : 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* drag handle — 모바일 전용 */}
        {!isDesktop && (
          <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line)' }} />
          </div>
        )}
        {/* header */}
        <div style={{
          padding: isDesktop ? '20px 22px 14px' : '4px 18px 12px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && <div className="kr-en" style={{ marginTop: 2, whiteSpace: 'nowrap' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', padding: 4, flex: 'none' }}>
            {Icon.close(20)}
          </button>
        </div>
        <div style={{ height: 1, background: 'var(--line-soft)' }} />
        {children}
      </div>
    </div>
  );
}

// Full-screen slide-in sheet (mobile) / centered large dialog (desktop)
export function FullSheet({ open, onClose = () => {}, children }) {
  useBackHandler(open, onClose);
  const isDesktop = useDesktop();

  if (isDesktop) {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          pointerEvents: open ? 'auto' : 'none',
          background: open ? 'rgba(20,16,12,0.45)' : 'transparent',
          transition: 'background 240ms ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 90,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg)',
            borderRadius: 20,
            width: 'min(820px, 92vw)',
            height: 'min(88vh, 900px)',
            display: 'flex', flexDirection: 'column',
            transform: open ? 'scale(1)' : 'scale(0.96)',
            opacity: open ? 1 : 0,
            transition: 'transform 280ms cubic-bezier(.2,.8,.2,1), opacity 220ms',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 300ms cubic-bezier(.2,.8,.2,1)',
      display: 'flex', flexDirection: 'column',
      zIndex: 90,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {children}
    </div>
  );
}
