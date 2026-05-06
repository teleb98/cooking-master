import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEAL_TYPES, DAYS_KR } from '../data';
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

function getWeekDates(weekOffset) {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + diff + weekOffset * 7 + i);
    return d;
  });
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function daysUntil(targetDow) {
  const today = new Date();
  const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon
  let diff = (targetDow - todayDow + 7) % 7;
  return diff === 0 ? 7 : diff;
}

/* ── 메뉴 선택 시트 ─────────────────────────────────────── */
function MealPicker({ open, onClose, onSelect, recipes }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  if (!open) return null;

  const filtered = recipes.filter(r =>
    r.name.includes(search) || (r.tags ?? []).some(t => t.includes(search)),
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>메뉴 선택</div>
            <button onClick={onClose} style={{ color: 'var(--ink-3)' }}>{Icon.close(18)}</button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg)', border: '1px solid var(--line)',
            borderRadius: 10, padding: '10px 14px',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="메뉴 이름 검색"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
            />
          </div>
        </div>

        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>검색 결과가 없습니다</div>
          ) : filtered.map(r => (
            <button key={r.name} onClick={() => onSelect(r)} style={{
              width: '100%', padding: '13px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid var(--line-soft)', background: 'none', textAlign: 'left',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{r.name}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 3, alignItems: 'center' }}>
                  {r.baby && (
                    <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 600 }}>이유식</span>
                  )}
                  {(r.tags ?? []).slice(0, 2).map(t => (
                    <span key={t} style={{ fontSize: 10, color: 'var(--ink-4)' }}>{t}</span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{r.kcal} kcal</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────── */
export default function CalendarScreen() {
  const [week, setWeek] = useState(0);
  const [meals, setMeals] = useState({});
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [picker, setPicker] = useState(null);

  const { accent, setChatOpen, setRecipe, replaceSlot, setReplaceSlot, mealVersion, showToast } = useApp();
  const { family } = useFamily();
  const navigate = useNavigate();

  const weekDates = useMemo(() => getWeekDates(week), [week]);
  const weekStart = toDateStr(weekDates[0]);
  const today = new Date();

  // 레시피 목록 (최초 1회)
  useEffect(() => {
    apiFetch('/recipes').then(d => setRecipes(d.recipes ?? [])).catch(() => {});
  }, []);

  // 주간 식단 조회
  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    apiFetch(`/meals?week_start=${weekStart}`)
      .then(d => {
        const map = {};
        for (const m of (d.meals ?? [])) {
          map[`${m.plan_date}_${m.meal_type}`] = m;
        }
        setMeals(map);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [weekStart, mealVersion]);

  // RecipeSheet "교체" 버튼 → replaceSlot 감지해서 picker 열기
  useEffect(() => {
    if (replaceSlot) {
      setPicker(replaceSlot);
      setReplaceSlot(null);
    }
  }, [replaceSlot, setReplaceSlot]);

  const handleCellClick = (date, mealType, meal) => {
    if (meal?.menu_name) {
      setRecipe({ name: meal.menu_name, plan_date: toDateStr(date), meal_type: mealType });
    } else {
      setPicker({ plan_date: toDateStr(date), meal_type: mealType });
    }
  };

  const handleSelectMeal = async (recipe) => {
    const { plan_date, meal_type } = picker;
    setPicker(null);
    const key = `${plan_date}_${meal_type}`;
    // 낙관적 업데이트
    setMeals(prev => ({
      ...prev,
      [key]: { plan_date, meal_type, menu_name: recipe.name, kcal: recipe.kcal, is_baby: recipe.baby },
    }));
    try {
      await apiFetch('/meals', {
        method: 'PUT',
        body: JSON.stringify({ plan_date, meal_type, menu_name: recipe.name }),
      });
    } catch {
      setMeals(prev => { const n = { ...prev }; delete n[key]; return n; });
      showToast('저장에 실패했어요. 다시 시도해주세요.');
    }
  };

  const dUntil = daysUntil(family.shopping_day);
  const totalMeals = Object.values(meals).filter(m => m.menu_name).length;

  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 12px) + 12px) 18px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div className="kr-en">MEAL PLAN · 식단 관리</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 2, letterSpacing: '-0.01em' }}>{family.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
            border: '2px solid var(--bg)',
          }}>{family.initial}</div>
          <button onClick={() => navigate('/onboarding')} style={{
            width: 34, height: 34, borderRadius: '50%', border: '1px dashed var(--ink-4)',
            color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.plus(14)}</button>
        </div>
      </div>

      {/* 가족 뱃지 + 신선도 바 */}
      <div style={{ padding: '4px 18px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {family.has_baby ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            background: 'var(--baby-soft)', color: 'var(--baby-ink)',
            borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none',
          }}>
            {Icon.baby(12)} {family.baby_months}M · {family.baby_stage}
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            background: 'var(--bg-2)', color: 'var(--ink-3)',
            borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none',
          }}>
            {family.type === 'solo' ? '1인 식단' : family.type === 'family' ? '가족 식단' : '2인 식단'}
          </div>
        )}
        <div style={{ flex: 1, height: 6, background: 'var(--line-soft)', borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(100, ((7 - dUntil) / 7) * 100)}%`,
            background: 'linear-gradient(90deg, var(--baby) 0%, #B8C58A 60%, var(--warn) 100%)',
            borderRadius: 999,
          }} />
        </div>
        <div className="kr-en" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>
          {family.shopping_day_kr}요일 · D-{dUntil}
        </div>
      </div>

      {/* 주 탭 */}
      <div style={{ padding: '0 18px', display: 'flex', gap: 8, marginBottom: 12 }}>
        {[0, 1].map(w => {
          const active = week === w;
          const label = `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()}`;
          const dates = getWeekDates(w);
          const rangeLabel = `${dates[0].getMonth() + 1}/${dates[0].getDate()}–${dates[6].getDate()}`;
          return (
            <button key={w} onClick={() => setWeek(w)} style={{
              flex: 1, height: 40, borderRadius: 12,
              background: active ? 'var(--ink)' : 'var(--surface)',
              color: active ? '#fff' : 'var(--ink-2)',
              border: active ? 'none' : '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 14px', fontSize: 13, fontWeight: 600,
            }}>
              <span>{w === 0 ? '이번 주' : '다음 주'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>{rangeLabel}</span>
            </button>
          );
        })}
      </div>

      {/* 식단 그리드 */}
      <div style={{ padding: '0 12px', flex: 1 }}>
        {fetchError && !loading && (
          <div style={{
            marginBottom: 10, padding: '14px 16px', borderRadius: 14,
            background: 'var(--warn-soft)', border: '1px solid var(--warn)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ color: 'var(--warn)', flexShrink: 0 }}>{Icon.warn(18)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>식단을 불러오지 못했어요</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>네트워크 연결을 확인해주세요</div>
            </div>
            <button
              onClick={() => { setFetchError(false); setLoading(true); apiFetch(`/meals?week_start=${weekStart}`).then(d => { const map = {}; for (const m of (d.meals ?? [])) map[`${m.plan_date}_${m.meal_type}`] = m; setMeals(map); }).catch(() => setFetchError(true)).finally(() => setLoading(false)); }}
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)', whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--warn)', background: 'transparent' }}
            >다시 시도</button>
          </div>
        )}
        <div style={{
          background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--line)',
          padding: '10px 6px 12px', boxShadow: 'var(--shadow-sm)',
          opacity: loading ? 0.6 : 1, transition: 'opacity 200ms',
        }}>
          {/* 날짜 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(7, 1fr)', gap: 4, padding: '0 4px 8px' }}>
            <div />
            {weekDates.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div key={i} style={{
                  textAlign: 'center', padding: '6px 0', borderRadius: 8,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--ink-2)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: isToday ? 0.85 : 0.6 }}>{DAYS_KR[i]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* 끼니 행 */}
          {MEAL_TYPES.map((mt, mi) => (
            <div key={mt.key} style={{
              display: 'grid', gridTemplateColumns: '34px repeat(7, 1fr)', gap: 4, padding: '4px',
              borderTop: mi === 0 ? '1px solid var(--line-soft)' : 'none',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', gap: 4 }}>
                {mt.key === 'breakfast' ? Icon.sun(12) : mt.key === 'lunch' ? Icon.noon(12) : Icon.moon(12)}
                <span style={{ fontSize: 9, fontWeight: 600 }}>{mt.kr}</span>
              </div>

              {weekDates.map((d, di) => {
                const key = `${toDateStr(d)}_${mt.key}`;
                const meal = meals[key];
                const isToday = d.toDateString() === today.toDateString();
                const highlight = isToday && mt.key === 'dinner';
                return (
                  <button
                    key={di}
                    onClick={() => handleCellClick(d, mt.key, meal)}
                    style={{
                      minHeight: 64, borderRadius: 10, padding: '6px 4px',
                      background: !meal?.menu_name ? 'transparent'
                        : highlight ? 'var(--ink)' : 'var(--bg-2)',
                      color: !meal?.menu_name ? 'var(--ink-4)'
                        : highlight ? '#fff' : 'var(--ink)',
                      border: !meal?.menu_name ? '1px dashed var(--line)' : '1px solid transparent',
                      fontSize: 10, lineHeight: 1.2, fontWeight: 500,
                      textAlign: 'left',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    }}
                  >
                    {!meal?.menu_name ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        {Icon.plus(14)}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 10.5, wordBreak: 'keep-all' }}>{meal.menu_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                          <span style={{ fontSize: 9, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>{meal.kcal}</span>
                          {meal.is_baby && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--baby)' }} />}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* 범례 */}
        <div style={{ padding: '14px 6px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: 'var(--ink-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--baby)' }} />이유식 분기
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 8, borderRadius: 3, background: 'var(--ink)' }} />오늘
          </div>
        </div>
      </div>

      {/* 장바구니 배너 + AI FAB */}
      <div style={{ padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={() => navigate('/grocery')} style={{
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 14, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)',
            color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.cart(20)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
              이번 주 장바구니 · {totalMeals}개 식단
            </div>
            <div className="kr-en" style={{ marginTop: 2 }}>{family.shopping_day_kr}요일 마트 · D-{dUntil}</div>
          </div>
          <div style={{
            background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '6px 10px', borderRadius: 999, fontFamily: 'var(--font-mono)',
          }}>D-{dUntil}</div>
        </button>

        <button onClick={() => setChatOpen(true)} style={{
          background: accent, color: '#fff', borderRadius: 16, padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: `0 8px 22px ${accent}4D`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.18)', width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {Icon.spark(16)}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>메뉴 바꿔달라고 하기</div>
              <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 1, whiteSpace: 'nowrap' }}>Ask Cooking Master AI</div>
            </div>
          </div>
          {Icon.chat(20)}
        </button>
      </div>

      {/* 메뉴 선택 시트 */}
      <MealPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onSelect={handleSelectMeal}
        recipes={recipes}
      />
    </div>
  );
}
