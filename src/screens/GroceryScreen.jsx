import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
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

function getWeekStart() {
  const today = new Date();
  const dow = today.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setUTCDate(today.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

const CAT_ORDER = ['육류', '채소', '유제품', '곡물·기타', '기타'];
const CAT_EN = { '육류': 'Meat', '채소': 'Vegetables', '유제품': 'Dairy', '곡물·기타': 'Grains', '기타': 'Other' };

function groupByCategory(items) {
  const map = {};
  for (const item of items) {
    const cat = item.category ?? '기타';
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  }
  return CAT_ORDER.filter(c => map[c]).map(c => ({ cat: c, cat_en: CAT_EN[c] ?? c, items: map[c] }));
}

function DeleteWarning({ item, onClose, onDelete, accent }) {
  if (!item) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,16,12,0.45)',
      display: 'flex', alignItems: 'flex-end', zIndex: 110,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%',
        padding: '22px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--warn-soft)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {Icon.warn(20)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>
              <span style={{ color: accent }}>{item.name}</span>은 {item.menu_count}개 메뉴에 사용됩니다
            </div>
            <div className="kr-en" style={{ marginTop: 4 }}>Used in {item.menu_count} planned meals</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>취소</button>
          <button onClick={() => { onDelete(item.id); onClose(); }} style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 600 }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

export default function GroceryScreen() {
  const { accent, showToast, setChatOpen } = useApp();
  const { family } = useFamily();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const weekStart = getWeekStart();

  const load = useCallback(() => {
    setLoading(true);
    setFetchError(false);
    apiFetch(`/grocery?week_start=${weekStart}`)
      .then(d => setItems(d.items ?? []))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const nextBought = !item.is_bought;
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_bought: nextBought } : i));
    try {
      await apiFetch('/grocery', { method: 'PUT', body: JSON.stringify({ id, is_bought: nextBought }) });
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_bought: !nextBought } : i));
      showToast('변경에 실패했어요. 다시 시도해주세요.');
    }
  };

  const deleteItem = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await apiFetch('/grocery', { method: 'DELETE', body: JSON.stringify({ id }) });
    } catch {
      load();
      showToast('삭제에 실패했어요. 다시 시도해주세요.');
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await apiFetch('/grocery', { method: 'POST', body: JSON.stringify({ week_start: weekStart }) });
      await load();
    } catch {
      showToast('장보기 목록 생성에 실패했어요.');
    } finally {
      setGenerating(false);
    }
  };

  const groups = groupByCategory(items).map(g => ({
    ...g,
    items: [...g.items].sort((a, b) => (a.is_bought ? 1 : 0) - (b.is_bought ? 1 : 0)),
  }));
  const total = items.length;
  const done = items.filter(i => i.is_bought).length;

  // D-X until shopping day
  const today = new Date();
  const todayDow = today.getUTCDay() === 0 ? 6 : today.getUTCDay() - 1;
  let dUntil = (family.shopping_day - todayDow + 7) % 7;
  if (dUntil === 0) dUntil = 7;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ color: 'var(--ink-2)' }}>{Icon.back(20)}</button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>장바구니</div>
          <div className="kr-en" style={{ marginTop: 1 }}>Grocery list · 이번 주</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setChatOpen(true)}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: accent, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 2px 8px ${accent}4D`,
            }}
          >
            {Icon.spark(15)}
          </button>
          <button onClick={generate} disabled={generating} style={{ color: generating ? 'var(--ink-4)' : 'var(--ink-2)' }}>
            {generating ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                </path>
              </svg>
            ) : Icon.share(18)}
          </button>
        </div>
      </div>

      {/* 진행 카드 */}
      <div style={{ padding: '4px 18px 14px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{done}</span>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/ {total}</span>
            <span className="kr-en" style={{ marginLeft: 'auto' }}>{family.shopping_day_kr}요일 마트 · D-{dUntil}</span>
          </div>
          <div style={{ marginTop: 10, height: 6, background: 'var(--bg-2)', borderRadius: 999 }}>
            <div style={{ height: '100%', width: `${total > 0 ? (done / total) * 100 : 0}%`, background: accent, borderRadius: 999, transition: 'width 300ms' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>
            <span>총 {total}개 재료</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{done}/{total} 완료</span>
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
        {/* 에러 상태 */}
        {fetchError && !loading && (
          <div style={{
            margin: '8px 0 14px', padding: '14px 16px', borderRadius: 14,
            background: 'var(--warn-soft)', border: '1px solid var(--warn)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ color: 'var(--warn)', flexShrink: 0 }}>{Icon.warn(18)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>목록을 불러오지 못했어요</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>네트워크 연결을 확인해주세요</div>
            </div>
            <button onClick={load} style={{
              fontSize: 12, fontWeight: 700, color: 'var(--warn)', whiteSpace: 'nowrap',
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--warn)', background: 'transparent',
            }}>다시 시도</button>
          </div>
        )}
        {/* 빈 상태 */}
        {!loading && !fetchError && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
              이번 주 식단에서 재료를 자동으로 생성할 수 있어요
            </div>
            <button onClick={generate} disabled={generating} style={{
              padding: '12px 24px', borderRadius: 12, background: accent, color: '#fff',
              fontSize: 14, fontWeight: 700,
              boxShadow: `0 4px 14px ${accent}4D`,
              opacity: generating ? 0.7 : 1,
            }}>
              {generating ? '생성 중...' : '장보기 목록 자동 생성'}
            </button>
          </div>
        )}

        {/* 카테고리별 목록 */}
        {groups.map(g => (
          <div key={g.cat} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{g.cat}</span>
                <span className="kr-en">{g.cat_en}</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
                {g.items.filter(i => i.is_bought).length}/{g.items.length}
              </span>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
              {g.items.map((it, ii) => (
                <div key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                  borderTop: ii === 0 ? 'none' : '1px solid var(--line-soft)',
                  opacity: it.is_bought ? 0.5 : 1, transition: 'opacity 200ms',
                }}>
                  <button onClick={() => toggle(it.id)} style={{
                    width: 26, height: 26, borderRadius: 8, flex: 'none',
                    background: it.is_bought ? accent : 'var(--surface)',
                    border: it.is_bought ? 'none' : '1.5px solid var(--line)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 150ms',
                  }}>{it.is_bought && Icon.check(14)}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', textDecoration: it.is_bought ? 'line-through' : 'none' }}>
                        {it.name}
                      </span>
                      {it.for_baby && (
                        <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 600, flexShrink: 0 }}>이유식</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                      {it.menu_count}개 메뉴
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{it.qty}</div>
                    <button onClick={() => setConfirmDelete(it)} style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <DeleteWarning
        item={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onDelete={deleteItem}
        accent={accent}
      />
    </div>
  );
}
