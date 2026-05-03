import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GROCERY } from '../data';
import { useApp } from '../context/AppContext';
import Icon from '../icons';

function DeleteWarning({ item, onClose, accent }) {
  if (!item) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,16,12,0.45)',
      display: 'flex', alignItems: 'flex-end', zIndex: 110,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%',
        padding: '22px 20px 20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--warn-soft)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {Icon.warn(20)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>
              <span style={{ color: accent }}>{item.name}</span>은 {item.menus}개 메뉴에 사용됩니다
            </div>
            <div className="kr-en" style={{ marginTop: 4 }}>Used in {item.menus} planned meals</div>
          </div>
        </div>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { day: '수 5/6 저녁', meal: '소고기 미역국' },
            { day: '금 5/8 저녁', meal: '연어구이 정식' },
          ].slice(0, item.menus).map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{r.day}</span>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.meal}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>취소</button>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: 'var(--bg-2)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>대체 추천</button>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 600 }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

export default function GroceryScreen() {
  const { accent } = useApp();
  const navigate = useNavigate();

  const [bought, setBought] = useState(() => {
    const s = new Set();
    GROCERY.forEach(c => c.items.forEach(it => { if (it.bought) s.add(it.name); }));
    return s;
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const toggle = name => setBought(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const total = GROCERY.reduce((a, c) => a + c.items.length, 0);
  const done = bought.size;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ color: 'var(--ink-2)' }}>{Icon.back(20)}</button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>장바구니</div>
          <div className="kr-en" style={{ marginTop: 1 }}>Grocery list · Week 1</div>
        </div>
        <button style={{ color: 'var(--ink-2)' }}>{Icon.share(18)}</button>
      </div>

      {/* Progress card */}
      <div style={{ padding: '4px 18px 14px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{done}</span>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/ {total}</span>
            <span className="kr-en" style={{ marginLeft: 'auto' }}>일요일 마트 · D-4</span>
          </div>
          <div style={{ marginTop: 10, height: 6, background: 'var(--bg-2)', borderRadius: 999 }}>
            <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: accent, borderRadius: 999, transition: 'width 300ms' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>
            <span>총 5개 메뉴 · 14개 분량</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>≈ ₩48,200</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
        {GROCERY.map(c => (
          <div key={c.cat} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.cat}</span>
                <span className="kr-en">{c.cat_en}</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
                {c.items.filter(i => bought.has(i.name)).length}/{c.items.length}
              </span>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
              {c.items.map((it, ii) => {
                const checked = bought.has(it.name);
                return (
                  <div key={it.name} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                    borderTop: ii === 0 ? 'none' : '1px solid var(--line-soft)',
                    opacity: checked ? 0.5 : 1, transition: 'opacity 200ms',
                  }}>
                    <button onClick={() => toggle(it.name)} style={{
                      width: 26, height: 26, borderRadius: 8, flex: 'none',
                      background: checked ? accent : 'var(--surface)',
                      border: checked ? 'none' : '1.5px solid var(--line)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 150ms',
                    }}>{checked && Icon.check(14)}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', textDecoration: checked ? 'line-through' : 'none' }}>
                          {it.name}
                        </span>
                        {it.forBaby && (
                          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 600, flexShrink: 0 }}>이유식</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                        {it.name_en} · {it.menus}개 메뉴
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{it.qty}</div>
                      <button onClick={() => setConfirmDelete(it)} style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>삭제</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <DeleteWarning item={confirmDelete} onClose={() => setConfirmDelete(null)} accent={accent} />
    </div>
  );
}
