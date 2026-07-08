import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../context/FamilyContext';
import { Sheet } from '../components/Sheet';
import Icon from '../icons';
import { DAYS_KR, MEAL_TYPES } from '../data';

function normIng(name) { return name.trim().replace(/\s+/g, '').toLowerCase(); }
function fridgeHas(fridgeItems, ingName) {
  const n = normIng(ingName);
  return fridgeItems.some(f => { const fn = normIng(f.name); return fn === n || fn.includes(n) || n.includes(fn); });
}
function getWeekStart() {
  const today = new Date();
  const diff = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

const TOKEN_KEY = 'cookingMaster_token';

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

/* ── 섹션 라벨 ───────────────────────────────────────────── */
function SectionLabel({ kr, en, babyTag }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '18px 4px 8px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{kr}</span>
      <span className="kr-en">{en}</span>
      {babyTag && (
        <span style={{ marginLeft: 'auto', fontSize: 9.5, padding: '2px 8px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 700 }}>BABY</span>
      )}
    </div>
  );
}

/* ── 메타 칩 (시간/인분) ────────────────────────────────── */
function MetaChip({ icon, label, value }) {
  if (!value) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '7px 12px', borderRadius: 20,
      background: 'var(--surface)', border: '1px solid var(--line)',
      fontSize: 12, color: 'var(--ink-2)', fontWeight: 500,
    }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

/* ── 영양 칩 ─────────────────────────────────────────────── */
function NutritionRow({ nutrition, kcal }) {
  if (!nutrition) return null;
  const items = [
    { label: '단백질', value: nutrition.protein_g, unit: 'g', color: '#3B82F6' },
    { label: '탄수화물', value: nutrition.carb_g,  unit: 'g', color: '#F59E0B' },
    { label: '지방',   value: nutrition.fat_g,    unit: 'g', color: '#EF4444' },
    { label: '식이섬유', value: nutrition.fiber_g, unit: 'g', color: '#10B981' },
  ];
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--line)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>1인분 영양정보</span>
        {kcal && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{kcal} kcal</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {items.map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)' }}>
              {item.value ?? '–'}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 2 }}>{item.unit}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 1, fontWeight: 500 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 조리 단계 ───────────────────────────────────────────── */
function StepsSection({ steps, loading, error, onRetry, accent }) {
  if (loading) {
    return (
      <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="var(--line)" strokeWidth="2.5"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke={accent} strokeWidth="2.5" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
          </path>
        </svg>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>AI가 조리법을 생성하는 중...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>조리법을 불러오지 못했어요</div>
        <button
          onClick={onRetry}
          style={{ padding: '9px 20px', borderRadius: 10, background: accent, color: '#fff', fontSize: 12.5, fontWeight: 600 }}
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!steps || steps.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((step, idx) => (
        <div key={idx} style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '13px 14px',
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--line-soft)',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 8,
            background: accent, color: '#fff',
            fontSize: 11.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 1,
          }}>
            {idx + 1}
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--ink)', flex: 1 }}>{step}</p>
        </div>
      ))}
    </div>
  );
}

function toDateStr(d) { return d.toISOString().slice(0, 10); }

/* ── 메인 컴포넌트 ──────────────────────────────────────── */
export default function RecipeSheet() {
  const { recipe, setRecipe, accent, setReplaceSlot, bumpMealVersion, markLocalMealChange, showToast } = useApp();
  const { user } = useAuth();
  const { family, saveProfile } = useFamily();
  const navigate = useNavigate();

  const [info, setInfo]           = useState(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [genLoading, setGenLoading]   = useState(false);
  const [genError, setGenError]       = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [addMode, setAddMode]         = useState(false);
  const [pickDate, setPickDate]       = useState(null);
  const [pickMeal, setPickMeal]       = useState(null);
  const [adding, setAdding]           = useState(false);
  const [fridgeItems, setFridgeItems] = useState([]);
  const [addingToGrocery, setAddingToGrocery] = useState(false);

  const name = recipe?.name ?? null;
  const [baseError, setBaseError] = useState(false);

  const weekDates = useMemo(() => {
    const today = new Date();
    const dow = today.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() + diff + i);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    });
  }, []);

  const fetchInfo = useCallback((recipeName) => {
    setBaseLoading(true);
    setBaseError(false);
    setGenError(false);
    apiFetch(`/recipes?name=${encodeURIComponent(recipeName)}`)
      .then(d => setInfo(d.recipe ?? null))
      .catch(() => { setInfo(null); setBaseError(true); })
      .finally(() => setBaseLoading(false));
  }, []);

  /* 기본 레시피 로드 + 픽커 상태 초기화 */
  useEffect(() => {
    if (!name) { setInfo(null); setBaseError(false); return; }
    setAddMode(false); setPickDate(null); setPickMeal(null);
    fetchInfo(name);
    apiFetch('/fridge').then(d => setFridgeItems(d.items ?? [])).catch(() => {});
  }, [name, fetchInfo]);

  /* 조리법 AI 생성 */
  const generateSteps = useCallback(async (recipeName) => {
    setGenLoading(true);
    setGenError(false);
    try {
      const d = await apiFetch('/recipes', {
        method: 'POST',
        body: JSON.stringify({ name: recipeName }),
      });
      setInfo(d.recipe ?? null);
    } catch {
      setGenError(true);
    } finally {
      setGenLoading(false);
    }
  }, []);

  /* 기본 정보 로드 후 steps 없으면 자동 생성 */
  useEffect(() => {
    if (!info) return;
    const hasSteps = Array.isArray(info.steps) && info.steps.length > 0;
    if (!hasSteps && !genLoading && !genError) {
      generateSteps(info.name);
    }
  }, [info, genLoading, genError, generateSteps]);

  const handleReplace = () => {
    const slot = { plan_date: recipe.plan_date, meal_type: recipe.meal_type };
    setRecipe(null);
    setReplaceSlot(slot);
  };

  const handleFavorite = useCallback(async () => {
    if (!recipe?.name) return;
    const likes = family.food_likes ?? [];
    if (likes.includes(recipe.name)) {
      showToast('이미 즐겨찾기에 있는 메뉴예요', 'info');
      return;
    }
    await saveProfile({ food_likes: [...likes, recipe.name] });
    showToast(`"${recipe.name}"이 즐겨찾기에 추가됐어요`, 'success');
  }, [recipe, family, saveProfile, showToast]);

  const handleAddToMeal = async () => {
    if (!pickDate || !pickMeal) return;
    setAdding(true);
    try {
      await apiFetch('/meals', {
        method: 'PUT',
        body: JSON.stringify({ plan_date: pickDate, meal_type: pickMeal, menu_name: name }),
      });
      markLocalMealChange(`${pickDate}_${pickMeal}`);
      bumpMealVersion();
      showToast(`${MEAL_TYPES.find(m => m.key === pickMeal)?.kr}에 "${name}"이 추가됐어요`, 'success');
      setRecipe(null);
    } catch {
      showToast('식단 추가에 실패했어요', 'error');
      setAdding(false);
    }
  };

  const handleAddMissingToGrocery = async () => {
    const missing = (info?.ingredients ?? []).filter(ing => !fridgeHas(fridgeItems, ing.name));
    if (!missing.length) return;
    setAddingToGrocery(true);
    try {
      const data = await apiFetch('/grocery', {
        method: 'POST',
        body: JSON.stringify({
          week_start: getWeekStart(),
          items: missing.map(ing => ({ name: ing.name, qty: ing.qty ?? '' })),
        }),
      });
      showToast(`${data.added}개 재료를 장보기에 추가했어요`, 'success');
      setRecipe(null);
      navigate('/grocery');
    } catch {
      showToast('장보기 추가에 실패했어요', 'error');
    } finally {
      setAddingToGrocery(false);
    }
  };

  const handleDeleteCustomRecipe = useCallback(async () => {
    if (!info?.name) return;
    if (!window.confirm(`"${info.name}" 레시피를 삭제할까요?`)) return;
    try {
      await apiFetch('/recipes', { method: 'DELETE', body: JSON.stringify({ name: info.name }) });
      showToast(`"${info.name}"이 삭제됐어요`, 'success');
      setRecipe(null);
    } catch {
      showToast('레시피 삭제에 실패했어요', 'error');
    }
  }, [info, showToast, setRecipe]);

  const handleDelete = async () => {
    if (!recipe?.plan_date) return;
    setDeleting(true);
    try {
      await apiFetch('/meals', {
        method: 'PUT',
        body: JSON.stringify({ plan_date: recipe.plan_date, meal_type: recipe.meal_type, menu_name: null }),
      });
      markLocalMealChange(`${recipe.plan_date}_${recipe.meal_type}`);
      setRecipe(null);
      bumpMealVersion();
    } catch {
      setDeleting(false);
    }
  };

  const MEAL_LABEL = { breakfast: '아침', lunch: '점심', dinner: '저녁' };
  const mealLabel   = recipe?.meal_type ? MEAL_LABEL[recipe.meal_type] : null;
  const totalTime   = info ? ((info.prep_time ?? 0) + (info.cook_time ?? 0)) : 0;
  const isMyRecipe  = !!(info?.user_id && info.user_id === user?.id);

  const subtitle = baseLoading
    ? '불러오는 중...'
    : info
      ? [info.kcal ? `${info.kcal} kcal` : null, mealLabel].filter(Boolean).join(' · ')
      : '';

  return (
    <Sheet
      open={!!recipe}
      onClose={() => setRecipe(null)}
      title={name || ''}
      subtitle={subtitle}
    >
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 24px' }}>

        {baseLoading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>불러오는 중...</div>
        )}

        {!baseLoading && info && (
          <>
            {/* 시간 · 인분 */}
            {(info.prep_time || info.cook_time || info.serving) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0 4px' }}>
                {info.prep_time && <MetaChip icon="🔪" label="손질" value={`${info.prep_time}분`} />}
                {info.cook_time && <MetaChip icon="🔥" label="조리" value={`${info.cook_time}분`} />}
                {totalTime > 0 && <MetaChip icon="⏱" label="총" value={`${totalTime}분`} />}
                {info.serving  && <MetaChip icon="👥" label="" value={`${info.serving}인분`} />}
              </div>
            )}

            {/* 영양정보 */}
            {info.nutrition && (
              <>
                <SectionLabel kr="영양정보" en="Nutrition" />
                <NutritionRow nutrition={info.nutrition} kcal={info.kcal} />
              </>
            )}

            {/* 재료 */}
            <SectionLabel kr="재료" en="Ingredients" />
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
              {(info.ingredients ?? []).length === 0 ? (
                <div style={{ padding: '14px', color: 'var(--ink-3)', fontSize: 13 }}>재료 정보 없음</div>
              ) : (info.ingredients ?? []).map((ing, idx) => {
                const inFridge = fridgeItems.length > 0 && fridgeHas(fridgeItems, ing.name);
                return (
                  <div key={idx} style={{
                    padding: '11px 14px', fontSize: 13,
                    color: inFridge ? 'var(--ink-3)' : 'var(--ink)',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--line-soft)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: inFridge ? 'rgba(78,155,95,0.04)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {fridgeItems.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: inFridge ? '#4E9B5F' : 'var(--ink-4)', flexShrink: 0 }}>
                          {inFridge ? '✓' : '✕'}
                        </span>
                      )}
                      <span style={{ textDecoration: inFridge ? 'line-through' : 'none' }}>{ing.name}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>{ing.qty}</span>
                  </div>
                );
              })}
            </div>
            {/* 부족 재료 장보기 추가 버튼 */}
            {fridgeItems.length > 0 && (() => {
              const missing = (info.ingredients ?? []).filter(ing => !fridgeHas(fridgeItems, ing.name));
              if (!missing.length) return null;
              return (
                <button
                  onClick={handleAddMissingToGrocery}
                  disabled={addingToGrocery}
                  style={{
                    marginTop: 8, width: '100%', padding: '12px 0', borderRadius: 12,
                    background: 'var(--surface)', border: `1.5px solid ${accent}`,
                    color: accent, fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: addingToGrocery ? 0.6 : 1,
                  }}
                >
                  🛒 {addingToGrocery ? '추가 중…' : `부족한 재료 ${missing.length}개 장보기에 추가`}
                </button>
              );
            })()}

            {/* 조리법 */}
            <SectionLabel kr="조리법" en="Instructions" />
            <StepsSection
              steps={info.steps}
              loading={genLoading}
              error={genError}
              onRetry={() => generateSteps(info.name)}
              accent={accent}
            />

            {/* 요리 팁 */}
            {info.tips && (
              <>
                <SectionLabel kr="요리 팁" en="Tips" />
                <div style={{
                  background: 'var(--surface)', borderRadius: 12,
                  border: `1px solid var(--line)`,
                  padding: '13px 14px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--ink)' }}>{info.tips}</p>
                </div>
              </>
            )}

            {/* 이유식 분기 */}
            {info.baby && family.has_baby && (
              <>
                <SectionLabel kr="이유식 분기" en="Baby branch" babyTag />
                <div style={{ background: 'var(--baby-soft)', borderRadius: 12, padding: 14, display: 'flex', gap: 12, color: 'var(--baby-ink)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {Icon.baby(20)}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{family.baby_stage} · {family.baby_months}개월</div>
                    <div>{info.baby_note || '간 없이 부드럽게 으깨서 죽에 섞기'}</div>
                  </div>
                </div>
              </>
            )}

            {/* 액션 버튼 */}
            {addMode ? (
              <>
                <SectionLabel kr="날짜 선택" en="Date" />
                <div style={{ display: 'flex', gap: 6 }}>
                  {weekDates.map((d, i) => {
                    const ds = toDateStr(d);
                    const todayStr = toDateStr(new Date());
                    const active = pickDate === ds;
                    return (
                      <button key={ds} onClick={() => setPickDate(ds)} style={{
                        flex: 1, padding: '9px 2px', borderRadius: 10, fontSize: 11.5, fontWeight: 600,
                        background: active ? accent : 'var(--surface)',
                        color: active ? '#fff' : 'var(--ink)',
                        border: active ? 'none' : '1px solid var(--line)',
                      }}>
                        <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.75)' : 'var(--ink-3)', marginBottom: 2 }}>{DAYS_KR[i]}</div>
                        <div>{d.getUTCDate()}</div>
                        {ds === todayStr && <div style={{ fontSize: 8.5, marginTop: 1, color: active ? 'rgba(255,255,255,0.8)' : accent }}>오늘</div>}
                      </button>
                    );
                  })}
                </div>
                <SectionLabel kr="식사 선택" en="Meal type" />
                <div style={{ display: 'flex', gap: 8 }}>
                  {MEAL_TYPES.map(m => (
                    <button key={m.key} onClick={() => setPickMeal(m.key)} style={{
                      flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
                      background: pickMeal === m.key ? accent : 'var(--surface)',
                      color: pickMeal === m.key ? '#fff' : 'var(--ink-2)',
                      border: pickMeal === m.key ? 'none' : '1px solid var(--line)',
                    }}>
                      {m.kr}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={() => setAddMode(false)} style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}>
                    취소
                  </button>
                  <button
                    onClick={handleAddToMeal}
                    disabled={!pickDate || !pickMeal || adding}
                    style={{ flex: 2, padding: '13px 0', borderRadius: 12, background: accent, color: '#fff', fontSize: 13, fontWeight: 600, opacity: (!pickDate || !pickMeal) ? 0.45 : 1 }}
                  >
                    {adding ? '추가 중…' : '식단에 추가'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {recipe?.plan_date && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: deleting ? 'var(--ink-4)' : '#E53E3E', fontSize: 13, fontWeight: 600 }}
                    >
                      {deleting ? '삭제 중…' : '메뉴 삭제'}
                    </button>
                    <button
                      onClick={handleReplace}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}
                    >
                      메뉴 교체
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: recipe?.plan_date ? 8 : 24 }}>
                  {!recipe?.plan_date && (
                    <button
                      onClick={() => setAddMode(true)}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}
                    >
                      + 식단에 추가
                    </button>
                  )}
                  <button
                    onClick={handleFavorite}
                    style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                  >
                    {Icon.heart(14)} 좋아하는 메뉴 추가
                  </button>
                  {recipe?.plan_date && (
                    <button
                      onClick={() => setRecipe(null)}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}
                    >
                      확인
                    </button>
                  )}
                </div>
                {!recipe?.plan_date && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {isMyRecipe && (
                      <button
                        onClick={handleDeleteCustomRecipe}
                        style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: '#E53E3E', fontSize: 13, fontWeight: 600 }}
                      >
                        레시피 삭제
                      </button>
                    )}
                    <button
                      onClick={() => setRecipe(null)}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}
                    >
                      닫기
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!baseLoading && !info && name && (
          <div style={{ padding: '32px 0 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            <div>{baseError ? '레시피를 불러오지 못했어요' : '레시피 정보를 찾을 수 없어요'}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {baseError && (
                <button onClick={() => fetchInfo(name)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}>
                  다시 시도
                </button>
              )}
              {recipe?.plan_date && (
                <button onClick={handleReplace} style={{ padding: '10px 20px', borderRadius: 10, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  다른 메뉴로 교체
                </button>
              )}
            </div>
            {/* 에러 상태에서도 즐겨찾기·닫기 버튼 노출 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={handleFavorite}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                {Icon.heart(14)} 좋아하는 메뉴 추가
              </button>
              <button
                onClick={() => setRecipe(null)}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
