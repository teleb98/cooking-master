import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const CATEGORIES = ['육류', '생선', '채소', '과일', '유제품', '곡물·기타', '기타'];
const CAT_ICONS  = { '육류': '🥩', '생선': '🐟', '채소': '🥦', '과일': '🍎', '유제품': '🥛', '곡물·기타': '🌾', '기타': '📦' };
const DEFAULT_EXPIRY = { '육류': 3, '생선': 2, '채소': 5, '과일': 5, '유제품': 7, '곡물·기타': 30, '기타': 7 };

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(expiresAt + 'T00:00:00');
  return Math.ceil((exp - today) / 86_400_000);
}
function expiryColor(d) {
  if (d === null) return 'var(--ink-4)';
  if (d <= 1)  return '#E05353';
  if (d <= 3)  return '#E8934A';
  return '#4E9B5F';
}
function expiryBg(d) {
  if (d === null) return 'var(--bg-2)';
  if (d <= 1)  return 'rgba(224,83,83,0.10)';
  if (d <= 3)  return 'rgba(232,147,74,0.10)';
  return 'rgba(78,155,95,0.10)';
}
function defaultExpiresAt(cat) {
  const days = DEFAULT_EXPIRY[cat] ?? 7;
  const d = new Date(); d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/* ── 빠른 추가 시트 ──────────────────────────────────── */
function AddSheet({ open, onClose, onAdd, accent }) {
  const [name, setName]         = useState('');
  const [qty, setQty]           = useState('1개');
  const [category, setCategory] = useState('기타');
  const [expiresAt, setExpires] = useState(defaultExpiresAt('기타'));
  const [scanning, setScanning] = useState(false);
  const [scanItems, setScanItems] = useState(null); // OCR 결과
  const [scanSelected, setScanSelected] = useState({});
  const fileRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(''); setQty('1개'); setCategory('기타');
      setExpires(defaultExpiresAt('기타')); setScanItems(null); setScanSelected({});
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open]);

  const handleCatChange = (cat) => {
    setCategory(cat);
    setExpires(defaultExpiresAt(cat));
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd([{ name: name.trim(), qty, category, expires_at: expiresAt }]);
    onClose();
  };

  const handleScanFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setScanItems(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const data = await apiFetch('/fridge', {
        method: 'POST',
        body: JSON.stringify({ scan_receipt: true, image_base64: base64, mime_type: file.type }),
      });
      if (data.items?.length) {
        setScanItems(data.items);
        const sel = {};
        data.items.forEach((_, i) => { sel[i] = true; });
        setScanSelected(sel);
      } else {
        setScanItems([]);
      }
    } catch {
      setScanItems([]);
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const handleScanAdd = () => {
    const toAdd = scanItems.filter((_, i) => scanSelected[i]);
    if (toAdd.length) onAdd(toAdd);
    onClose();
  };

  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxHeight: '88dvh',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>재료 추가</div>
          <button onClick={onClose}>{Icon.close(18)}</button>
        </div>

        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 영수증 스캔 버튼 */}
          {!scanItems && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '13px 16px', borderRadius: 12,
                border: `1.5px dashed ${accent}`,
                background: `${accent}0D`, color: accent, fontWeight: 600, fontSize: 14,
              }}
            >
              {scanning ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                  </path>
                </svg>
              ) : Icon.camera(18)}
              {scanning ? '영수증 인식 중…' : '영수증 사진으로 자동 등록'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScanFile} />

          {/* OCR 결과 리뷰 */}
          {scanItems !== null && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 10 }}>
                {scanItems.length > 0 ? `인식된 재료 ${scanItems.length}개 — 추가할 항목을 선택하세요` : '영수증에서 식재료를 인식하지 못했습니다'}
              </div>
              {scanItems.map((it, i) => {
                const dl = daysLeft(it.expires_at);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: '1px solid var(--line-soft)',
                  }}>
                    <button
                      onClick={() => setScanSelected(s => ({ ...s, [i]: !s[i] }))}
                      style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        background: scanSelected[i] ? accent : 'var(--surface)',
                        border: scanSelected[i] ? 'none' : '1.5px solid var(--line)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{scanSelected[i] && Icon.check(12)}</button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{it.qty} · {it.category}</div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: expiryBg(dl), color: expiryColor(dl),
                    }}>D-{dl}</div>
                  </div>
                );
              })}
              {scanItems.length > 0 && (
                <button onClick={handleScanAdd} style={{
                  marginTop: 14, width: '100%', padding: '14px 0', borderRadius: 12,
                  background: accent, color: '#fff', fontSize: 14, fontWeight: 700,
                }}>
                  선택 항목 추가 ({Object.values(scanSelected).filter(Boolean).length}개)
                </button>
              )}
            </div>
          )}

          {/* 직접 입력 */}
          {!scanItems && (
            <>
              <div style={{ borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 600, marginBottom: 4 }}>재료명</div>
                  <input ref={nameRef} value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="예: 두부, 돼지고기, 당근"
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'none', fontSize: 15, color: 'var(--ink)' }}
                  />
                </div>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 600, marginBottom: 4 }}>수량</div>
                  <input value={qty} onChange={e => setQty(e.target.value)}
                    placeholder="예: 1개, 500g, 1팩"
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'none', fontSize: 15, color: 'var(--ink)' }}
                  />
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 600, marginBottom: 6 }}>유통기한</div>
                  <input type="date" value={expiresAt} onChange={e => setExpires(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>카테고리</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => handleCatChange(cat)} style={{
                      padding: '6px 12px', borderRadius: 999,
                      background: category === cat ? accent : 'var(--bg-2)',
                      color: category === cat ? '#fff' : 'var(--ink-2)',
                      fontSize: 12, fontWeight: 600, border: 'none',
                      transition: 'all 150ms',
                    }}>{CAT_ICONS[cat]} {cat}</button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAdd} disabled={!name.trim()}
                style={{
                  padding: '15px 0', borderRadius: 12,
                  background: name.trim() ? accent : 'var(--bg-2)',
                  color: name.trim() ? '#fff' : 'var(--ink-4)',
                  fontSize: 15, fontWeight: 700,
                  transition: 'all 150ms',
                }}
              >냉장고에 추가</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 메인 화면 ───────────────────────────────────────── */
export default function FridgeScreen() {
  const { accent, showToast } = useApp();
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/fridge')
      .then(d => setItems(d.items ?? []))
      .catch(() => showToast('재고를 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (newItems) => {
    try {
      await apiFetch('/fridge', {
        method: 'POST',
        body: JSON.stringify({ items: newItems }),
      });
      load();
      showToast(`${newItems.length}개 재료를 냉장고에 추가했어요.`);
    } catch {
      showToast('추가에 실패했어요.');
    }
  };

  const handleConsume = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await apiFetch('/fridge', {
        method: 'PUT',
        body: JSON.stringify({ id, consumed_at: new Date().toISOString() }),
      });
    } catch {
      load();
    }
  };

  const handleDelete = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await apiFetch('/fridge', { method: 'DELETE', body: JSON.stringify({ id }) });
    } catch {
      load();
    }
  };

  // 카테고리별 그룹핑
  const urgent = items.filter(it => {
    const dl = daysLeft(it.expires_at);
    return dl !== null && dl <= 3;
  });
  const byCategory = {};
  for (const cat of CATEGORIES) {
    const catItems = items.filter(it => it.category === cat);
    if (catItems.length) byCategory[cat] = catItems;
  }
  const otherItems = items.filter(it => !CATEGORIES.includes(it.category));
  if (otherItems.length) byCategory['기타'] = [...(byCategory['기타'] ?? []), ...otherItems];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>냉장고</div>
          <div className="kr-en" style={{ marginTop: 1 }}>Fridge · {items.length}개 재료</div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 10px ${accent}4D`,
          }}
        >{Icon.plus(18)}</button>
      </div>

      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>불러오는 중…</div>
        ) : items.length === 0 ? (
          /* 빈 상태 */
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧊</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>냉장고가 비어있어요</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24, lineHeight: 1.6 }}>
              재료를 등록하면 AI 식단 추천에<br />냉장고 재고가 자동으로 반영돼요
            </div>
            <button onClick={() => setAddOpen(true)} style={{
              padding: '12px 28px', borderRadius: 12,
              background: accent, color: '#fff', fontSize: 14, fontWeight: 700,
              boxShadow: `0 4px 14px ${accent}4D`,
            }}>재료 추가하기</button>
          </div>
        ) : (
          <>
            {/* 임박 재료 섹션 */}
            {urgent.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#E05353', letterSpacing: '0.06em', padding: '10px 4px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {Icon.warn(12)} 임박 재료 · 빨리 사용하세요
                </div>
                <div style={{ background: 'rgba(224,83,83,0.06)', border: '1px solid rgba(224,83,83,0.2)', borderRadius: 14, overflow: 'hidden' }}>
                  {urgent.map((it, ii) => (
                    <FridgeItem key={it.id} item={it} isLast={ii === urgent.length - 1}
                      onConsume={handleConsume} onDelete={handleDelete} accent={accent} />
                  ))}
                </div>
              </div>
            )}

            {/* 카테고리별 그룹 */}
            {Object.entries(byCategory).map(([cat, catItems]) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.06em', padding: '8px 4px 6px' }}>
                  {CAT_ICONS[cat]} {cat}
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                  {catItems.map((it, ii) => (
                    <FridgeItem key={it.id} item={it} isLast={ii === catItems.length - 1}
                      onConsume={handleConsume} onDelete={handleDelete} accent={accent} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAdd} accent={accent} />
    </div>
  );
}

/* ── 아이템 행 ─────────────────────────────────────── */
function FridgeItem({ item, isLast, onConsume, onDelete, accent }) {
  const [showActions, setShowActions] = useState(false);
  const dl = daysLeft(item.expires_at);

  return (
    <div style={{ borderTop: isLast ? 'none' : undefined, borderBottom: isLast ? 'none' : '1px solid var(--line-soft)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
      }}>
        {/* 체크(소비) 버튼 */}
        <button onClick={() => onConsume(item.id)} style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          border: '1.5px solid var(--line)', background: 'var(--surface)',
          color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} title="소비 완료">{Icon.check(12)}</button>

        {/* 이름/수량 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{item.name}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{item.qty} · {item.category}</div>
        </div>

        {/* 유통기한 칩 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dl !== null && (
            <div style={{
              fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7,
              background: expiryBg(dl), color: expiryColor(dl),
              fontFamily: 'var(--font-mono)',
            }}>
              {dl <= 0 ? '만료' : `D-${dl}`}
            </div>
          )}
          {/* 더보기 */}
          <button
            onClick={() => setShowActions(s => !s)}
            style={{ color: 'var(--ink-4)', padding: '4px', borderRadius: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 인라인 액션 */}
      {showActions && (
        <div style={{
          display: 'flex', borderTop: '1px solid var(--line-soft)',
          background: 'var(--bg-2)',
        }}>
          <button
            onClick={() => { onConsume(item.id); setShowActions(false); }}
            style={{ flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 600, color: accent, borderRight: '1px solid var(--line-soft)' }}
          >✓ 소비 완료</button>
          <button
            onClick={() => { onDelete(item.id); setShowActions(false); }}
            style={{ flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 600, color: '#E05353' }}
          >삭제</button>
        </div>
      )}
    </div>
  );
}
