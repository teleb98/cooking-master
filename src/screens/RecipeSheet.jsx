import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { Sheet } from '../components/Sheet';
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';

async function apiFetch(path) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function SectionLabel({ kr, en, babyTag }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 4px 8px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{kr}</span>
      <span className="kr-en">{en}</span>
      {babyTag && (
        <span style={{ marginLeft: 'auto', fontSize: 9.5, padding: '2px 8px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 700 }}>BABY</span>
      )}
    </div>
  );
}

export default function RecipeSheet() {
  const { recipe, setRecipe, accent, setReplaceSlot } = useApp();
  const { family } = useFamily();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const name = recipe?.name ?? null;

  useEffect(() => {
    if (!name) { setInfo(null); return; }
    setLoading(true);
    apiFetch(`/recipes?name=${encodeURIComponent(name)}`)
      .then(d => setInfo(d.recipe ?? null))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [name]);

  const handleReplace = () => {
    const slot = { plan_date: recipe.plan_date, meal_type: recipe.meal_type };
    setRecipe(null);
    setReplaceSlot(slot);
  };

  const mealLabel = recipe?.meal_type === 'breakfast' ? '아침' : recipe?.meal_type === 'lunch' ? '점심' : '저녁';

  return (
    <Sheet
      open={!!recipe}
      onClose={() => setRecipe(null)}
      title={name || ''}
      subtitle={info ? `${info.kcal} kcal · ${mealLabel}` : loading ? '불러오는 중...' : ''}
    >
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 18px' }}>
        {loading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>불러오는 중...</div>
        )}

        {!loading && info && (
          <>
            {/* Ingredients */}
            <SectionLabel kr="재료" en="Ingredients" />
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
              {(info.ingredients ?? []).length === 0 ? (
                <div style={{ padding: '14px', color: 'var(--ink-3)', fontSize: 13 }}>재료 정보 없음</div>
              ) : (info.ingredients ?? []).map((ing, idx) => (
                <div key={idx} style={{
                  padding: '11px 14px', fontSize: 13, color: 'var(--ink)',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--line-soft)',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{ing.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{ing.qty}</span>
                </div>
              ))}
            </div>

            {/* Baby branch */}
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

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={handleReplace}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}
              >
                메뉴 교체
              </button>
              <button
                onClick={() => setRecipe(null)}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}
              >
                확인
              </button>
            </div>
          </>
        )}

        {!loading && !info && name && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            <div>레시피 정보를 찾을 수 없어요</div>
            <button onClick={handleReplace} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>
              다른 메뉴로 교체
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
