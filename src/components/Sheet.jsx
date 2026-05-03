import Icon from '../icons';

// Slide-up bottom sheet
export function Sheet({ open, onClose, title, subtitle, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: open ? 'auto' : 'none',
        background: open ? 'rgba(20,16,12,0.45)' : 'transparent',
        transition: 'background 240ms ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          height: '82%',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: '0 -8px 30px rgba(20,16,12,0.18)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* drag handle */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line)' }} />
        </div>
        {/* header */}
        <div style={{
          padding: '4px 18px 12px',
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

// Full-screen slide-in sheet (from right)
export function FullSheet({ open, children }) {
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
