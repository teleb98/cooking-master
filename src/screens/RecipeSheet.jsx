import { useApp } from '../context/AppContext';
import { MEAL_LIB } from '../data';
import { Sheet } from '../components/Sheet';
import Icon from '../icons';

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
  const { recipe, setRecipe, accent } = useApp();
  const info = recipe ? (MEAL_LIB[recipe] || { kcal: 0, ing: [], baby: false }) : null;

  return (
    <Sheet open={!!recipe} onClose={() => setRecipe(null)} title={recipe || ''} subtitle={info ? `${info.kcal} kcal · 4인분` : ''}>
      {info && (
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 18px' }}>
          {/* Photo placeholder */}
          <div style={{
            height: 140, borderRadius: 14, marginTop: 6, marginBottom: 14,
            background: 'repeating-linear-gradient(45deg, var(--bg-2) 0 10px, var(--bg) 10px 20px)',
            border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>[ recipe photo ]</div>

          {/* Ingredients */}
          <SectionLabel kr="재료" en="Ingredients" />
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            {info.ing.map((ing, idx) => {
              const parts = ing.split(' ');
              const amount = parts[parts.length - 1];
              const name = parts.slice(0, -1).join(' ');
              return (
                <div key={idx} style={{
                  padding: '11px 14px', fontSize: 13, color: 'var(--ink)',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--line-soft)',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{amount}</span>
                </div>
              );
            })}
          </div>

          {/* Baby branch */}
          {info.baby && (
            <>
              <SectionLabel kr="이유식 분기" en="Baby branch · 8M 중기" babyTag />
              <div style={{ background: 'var(--baby-soft)', borderRadius: 12, padding: 14, display: 'flex', gap: 12, color: 'var(--baby-ink)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {Icon.baby(20)}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>분기 포인트 · Step 3</div>
                  {info.babyNote || '간 없이 부드럽게 으깨서 죽에 섞기'}
                </div>
              </div>
            </>
          )}

          {/* Steps */}
          <SectionLabel kr="조리 순서" en="Steps" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              '재료를 손질해 적당한 크기로 자릅니다.',
              '팬을 중불에 달구고 기름을 두른 뒤 마늘을 볶습니다.',
              '주재료를 넣고 양념과 함께 5분간 볶아 마무리합니다.',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 14px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{s}</div>
              </div>
            ))}
          </div>

          {/* Feedback */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}>
              👎 별로예요
            </button>
            <button style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>
              👍 좋아요
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
