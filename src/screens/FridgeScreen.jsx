import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../icons';

/* 이미지를 Canvas로 리사이즈 + JPEG 압축 후 base64 반환 */
async function compressImage(file, maxPx = 1920, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

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
const UNITS = ['개', 'g', 'kg', 'ml', 'L', '팩', '봉', '캔', '병', '묶음', '줄'];

function parseQty(str) {
  const m = (str ?? '1개').trim().match(/^([\d.]+)\s*(.+)?$/);
  if (m) return { amount: m[1], unit: (m[2] ?? '개').trim() || '개' };
  return { amount: '1', unit: str || '개' };
}
function buildQty(amount, unit) {
  return `${amount || '1'}${unit}`;
}

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

/* ── 수량 입력 컴포넌트 (숫자 + 단위 칩) ───────────────── */
function QtyInput({ amount, unit, onAmountChange, onUnitChange, accent }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          type="number" min="0" step="any"
          value={amount}
          onChange={e => onAmountChange(e.target.value)}
          style={{
            width: 80, border: '1px solid var(--line)', borderRadius: 8,
            padding: '8px 10px', fontSize: 16, fontWeight: 700,
            color: 'var(--ink)', background: 'var(--surface)',
            outline: 'none', textAlign: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        />
        <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 600 }}>
          {unit}
        </span>
      </div>
      <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {UNITS.map(u => (
          <button key={u} onClick={() => onUnitChange(u)} style={{
            flexShrink: 0,
            padding: '5px 11px', borderRadius: 999,
            background: unit === u ? accent : 'var(--bg-2)',
            color: unit === u ? '#fff' : 'var(--ink-2)',
            fontSize: 12, fontWeight: 600,
            border: unit === u ? 'none' : '1px solid var(--line)',
            transition: 'all 120ms',
          }}>{u}</button>
        ))}
      </div>
    </div>
  );
}

/* ── OCR 항목 행 (인라인 편집) ────────────────────────── */
function ScanItemRow({ item, index, selected, onToggle, onUpdate, accent }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseQty(item.qty);
  const dl = daysLeft(item.expires_at);

  const update = (patch) => onUpdate(index, patch);

  return (
    <div style={{ borderBottom: '1px solid var(--line-soft)' }}>
      {/* 요약 행 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0' }}>
        <button
          onClick={() => onToggle(index)}
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            background: selected ? accent : 'var(--surface)',
            border: selected ? 'none' : '1.5px solid var(--line)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{selected && Icon.check(12)}</button>

        {/* 재료명 (인라인 편집) */}
        <input
          value={item.name}
          onChange={e => update({ name: e.target.value })}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'none',
            fontSize: 14, fontWeight: 600, color: 'var(--ink)', minWidth: 0,
          }}
        />

        {/* 수량 요약 + 편집 토글 */}
        <button
          onClick={() => setExpanded(s => !s)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            padding: '4px 8px', borderRadius: 7,
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            fontSize: 12, fontWeight: 700, color: 'var(--ink-2)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>{item.qty}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d={expanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}/>
          </svg>
        </button>

        {/* D-X 칩 */}
        {dl !== null && (
          <div style={{
            fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
            background: expiryBg(dl), color: expiryColor(dl), flexShrink: 0,
          }}>D-{dl}</div>
        )}
      </div>

      {/* 확장: 수량 + 유통기한 편집 */}
      {expanded && (
        <div style={{
          background: 'var(--bg-2)', borderRadius: 10, padding: '12px 14px',
          marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>수량 / 무게</div>
            <QtyInput
              amount={parsed.amount}
              unit={parsed.unit}
              onAmountChange={a => update({ qty: buildQty(a, parsed.unit) })}
              onUnitChange={u => update({ qty: buildQty(parsed.amount, u) })}
              accent={accent}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>유통기한</div>
            <input
              type="date" value={item.expires_at ?? ''}
              onChange={e => update({ expires_at: e.target.value })}
              style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>카테고리</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => update({ category: cat })} style={{
                  padding: '4px 10px', borderRadius: 999,
                  background: item.category === cat ? accent : 'var(--surface)',
                  color: item.category === cat ? '#fff' : 'var(--ink-3)',
                  fontSize: 11, fontWeight: 600,
                  border: item.category === cat ? 'none' : '1px solid var(--line)',
                }}>{CAT_ICONS[cat]} {cat}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 빠른 추가 시트 ──────────────────────────────────── */
function AddSheet({ open, onClose, onAdd, accent }) {
  const [name, setName]         = useState('');
  const [amount, setAmount]     = useState('1');
  const [unit, setUnit]         = useState('개');
  const [category, setCategory] = useState('기타');
  const [expiresAt, setExpires] = useState(defaultExpiresAt('기타'));
  const [scanning, setScanning] = useState(false);
  const [scanItems, setScanItems] = useState(null);
  const [scanSelected, setScanSelected] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);
  const nameRef    = useRef(null);

  useEffect(() => {
    if (open) {
      setName(''); setAmount('1'); setUnit('개'); setCategory('기타');
      setExpires(defaultExpiresAt('기타')); setScanItems(null); setScanSelected({});
      setPreviewUrl(null);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open]);

  const handleCatChange = (cat) => {
    setCategory(cat);
    setExpires(defaultExpiresAt(cat));
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd([{ name: name.trim(), qty: buildQty(amount, unit), category, expires_at: expiresAt }]);
    onClose();
  };

  const handleScanFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 미리보기 생성
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setScanning(true);
    setScanItems(null);
    try {
      const base64 = await compressImage(file);
      const data = await apiFetch('/fridge', {
        method: 'POST',
        body: JSON.stringify({ scan_receipt: true, image_base64: base64, mime_type: 'image/jpeg' }),
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

  const updateScanItem = (index, patch) => {
    setScanItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
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
        width: '100%', maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {scanItems !== null ? '인식 결과 확인' : '재료 추가'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(scanItems !== null || scanning) && (
              <button
                onClick={() => { setScanItems(null); setPreviewUrl(null); setScanning(false); }}
                style={{ fontSize: 12, color: accent, fontWeight: 600, padding: '4px 8px', borderRadius: 6, border: `1px solid ${accent}40`, background: `${accent}0D` }}
              >직접 입력</button>
            )}
            <button onClick={onClose}>{Icon.close(18)}</button>
          </div>
        </div>

        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 영수증 스캔 버튼 (직접입력 모드일 때만) */}
          {!scanItems && !scanning && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => cameraRef.current?.click()}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 10px', borderRadius: 14,
                  border: `1.5px solid ${accent}`,
                  background: `${accent}0D`, color: accent, fontWeight: 600, fontSize: 13,
                }}
              >
                {Icon.camera(22)}
                카메라 촬영
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 10px', borderRadius: 14,
                  border: '1.5px solid var(--line)',
                  background: 'var(--bg-2)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 13,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                앨범에서 선택
              </button>
            </div>
          )}

          {/* 스캔 중 — 미리보기 + 스피너 */}
          {scanning && (
            <div style={{
              borderRadius: 14, overflow: 'hidden', position: 'relative',
              border: '1px solid var(--line)',
            }}>
              {previewUrl && (
                <img src={previewUrl} alt="영수증 미리보기" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{
                position: previewUrl ? 'absolute' : 'relative',
                inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                background: previewUrl ? 'rgba(0,0,0,0.55)' : 'var(--bg-2)',
                padding: previewUrl ? 0 : '28px 0',
                minHeight: previewUrl ? undefined : 100,
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={previewUrl ? '#fff' : 'var(--line)'} strokeWidth="2.5"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke={accent} strokeWidth="2.5" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                  </path>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: previewUrl ? '#fff' : 'var(--ink-2)' }}>
                  AI가 재료를 인식하는 중…
                </span>
              </div>
            </div>
          )}

          {/* 숨겨진 파일 입력: 카메라 */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScanFile} />
          {/* 숨겨진 파일 입력: 갤러리 */}
          <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleScanFile} />

          {/* OCR 결과 리뷰 */}
          {scanItems !== null && (
            <div>
              {/* 미리보기 썸네일 (결과 위) */}
              {previewUrl && (
                <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
                  <img src={previewUrl} alt="스캔 이미지" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', display: 'block' }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {scanItems.length > 0
                    ? `${scanItems.length}개 재료 인식됨 · 수량 칩을 탭해서 수정하세요`
                    : '식재료를 인식하지 못했습니다 — 다시 시도하거나 직접 입력하세요'}
                </div>
                <button
                  onClick={() => { setScanItems(null); setPreviewUrl(null); }}
                  style={{ fontSize: 11, color: accent, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}
                >다시 스캔</button>
              </div>
              {scanItems.map((it, i) => (
                <ScanItemRow
                  key={i} item={it} index={i}
                  selected={!!scanSelected[i]}
                  onToggle={idx => setScanSelected(s => ({ ...s, [idx]: !s[idx] }))}
                  onUpdate={updateScanItem}
                  accent={accent}
                />
              ))}
              {scanItems.length > 0 && (
                <button onClick={handleScanAdd} style={{
                  marginTop: 14, width: '100%', padding: '14px 0', borderRadius: 12,
                  background: accent, color: '#fff', fontSize: 14, fontWeight: 700,
                }}>
                  선택 항목 추가 ({Object.values(scanSelected).filter(Boolean).length}개)
                </button>
              )}
              {scanItems.length === 0 && (
                <button onClick={() => { setScanItems(null); setPreviewUrl(null); }} style={{
                  marginTop: 8, width: '100%', padding: '14px 0', borderRadius: 12,
                  background: 'var(--bg-2)', color: 'var(--ink-2)', fontSize: 14, fontWeight: 600,
                }}>직접 입력으로 전환</button>
              )}
            </div>
          )}

          {/* 직접 입력 */}
          {!scanItems && (
            <>
              <div style={{ borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>재료명</div>
                  <input ref={nameRef} value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="예: 두부, 돼지고기, 당근"
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'none', fontSize: 15, color: 'var(--ink)' }}
                  />
                </div>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>수량 / 무게</div>
                  <QtyInput
                    amount={amount} unit={unit}
                    onAmountChange={setAmount} onUnitChange={setUnit}
                    accent={accent}
                  />
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>유통기한</div>
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
