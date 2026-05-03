import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLAN, MEAL_LIB, MEAL_TYPES, DAYS_KR, FAMILY_REF_BASE, TODAY_INDEX } from '../data';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import Icon from '../icons';

function Legend({ swatch, round, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: round ? 8 : 14, height: 8, borderRadius: round ? '50%' : 3, background: swatch, flex: 'none' }} />
      {children}
    </div>
  );
}

export default function CalendarScreen() {
  const [week, setWeek] = useState(0);
  const { accent, setChatOpen, setRecipe } = useApp();
  const { family } = useFamily();
  const navigate = useNavigate();

  return (
    <div style={{
      background: 'var(--bg)',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 12px) + 12px) 18px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div className="kr-en">MEAL PLAN · 식단 관리</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 2, letterSpacing: '-0.01em' }}>
            {family.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div title={family.name} style={{
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

      {/* Type badge + freshness bar */}
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
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '42%',
            background: 'linear-gradient(90deg, var(--baby) 0%, #B8C58A 60%, var(--warn) 100%)',
            borderRadius: 999,
          }} />
        </div>
        <div className="kr-en" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>
          {family.shopping_day_kr}요일 · D-4
        </div>
      </div>

      {/* Week tabs */}
      <div style={{ padding: '0 18px', display: 'flex', gap: 8, marginBottom: 12 }}>
        {[0, 1].map(w => {
          const active = week === w;
          return (
            <button key={w} onClick={() => setWeek(w)} style={{
              flex: 1, height: 40, borderRadius: 12,
              background: active ? 'var(--ink)' : 'var(--surface)',
              color: active ? '#fff' : 'var(--ink-2)',
              border: active ? 'none' : '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 14px', fontSize: 13, fontWeight: 600,
            }}>
              <span style={{ whiteSpace: 'nowrap' }}>{w === 0 ? '이번 주' : '다음 주'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap' }}>
                {w === 0 ? 'WEEK 1' : 'WEEK 2'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Meal grid */}
      <div style={{ padding: '0 12px', flex: 1 }}>
        <div style={{
          background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--line)',
          padding: '10px 6px 12px', boxShadow: 'var(--shadow-sm)',
        }}>
          {/* Day header */}
          <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(7, 1fr)', gap: 4, padding: '0 4px 8px' }}>
            <div />
            {DAYS_KR.map((d, i) => {
              const isToday = week === 0 && i === TODAY_INDEX;
              const date = FAMILY_REF_BASE + week * 7 + i;
              return (
                <div key={i} style={{
                  textAlign: 'center', padding: '6px 0', borderRadius: 8,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--ink-2)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: isToday ? 0.85 : 0.6 }}>{d}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{date}</div>
                </div>
              );
            })}
          </div>

          {/* Meal rows */}
          {MEAL_TYPES.map((mt, mi) => (
            <div key={mt.key} style={{
              display: 'grid', gridTemplateColumns: '34px repeat(7, 1fr)', gap: 4,
              padding: '4px',
              borderTop: mi === 0 ? '1px solid var(--line-soft)' : 'none',
            }}>
              {/* Row label */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-3)', gap: 4,
              }}>
                {mt.key === 'breakfast' ? Icon.sun(12) : mt.key === 'lunch' ? Icon.noon(12) : Icon.moon(12)}
                <span style={{ fontSize: 9, fontWeight: 600 }}>{mt.kr}</span>
              </div>

              {/* Meal cells */}
              {DAYS_KR.map((_, di) => {
                const meal = PLAN[week * 7 + di][mi];
                const info = meal && MEAL_LIB[meal];
                const isToday = week === 0 && di === TODAY_INDEX;
                const isUserInput = meal === '갈비찜';
                return (
                  <button
                    key={di}
                    onClick={() => meal && setRecipe(meal)}
                    style={{
                      minHeight: 64, borderRadius: 10, padding: '6px 4px',
                      background: !meal ? 'transparent'
                        : isUserInput ? 'var(--user-soft)'
                        : isToday && mi === 2 ? 'var(--ink)' : 'var(--bg-2)',
                      color: !meal ? 'var(--ink-4)'
                        : isUserInput ? 'var(--user)'
                        : isToday && mi === 2 ? '#fff' : 'var(--ink)',
                      border: !meal ? '1px dashed var(--line)' : '1px solid transparent',
                      fontSize: 10, lineHeight: 1.2, fontWeight: 500,
                      textAlign: 'left',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    }}
                  >
                    {!meal ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        {Icon.plus(14)}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 10.5, wordBreak: 'keep-all' }}>{meal}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                          <span style={{ fontSize: 9, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>{info.kcal}</span>
                          {info.baby && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--baby)' }} />}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ padding: '14px 6px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: 'var(--ink-3)' }}>
          <Legend swatch="var(--baby)" round>이유식 분기</Legend>
          <Legend swatch="var(--user-soft)">직접 입력</Legend>
          <Legend swatch="var(--ink)">오늘</Legend>
        </div>
      </div>

      {/* Grocery banner + AI FAB */}
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
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>이번 주 장바구니 · 16개 재료</div>
            <div className="kr-en" style={{ marginTop: 2 }}>{family.shopping_day_kr}요일 마트 · last updated 9:21</div>
          </div>
          <div style={{
            background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '6px 10px', borderRadius: 999, fontFamily: 'var(--font-mono)',
          }}>D-4</div>
        </button>

        <button onClick={() => setChatOpen(true)} style={{
          background: accent, color: '#fff',
          borderRadius: 16, padding: '14px 18px',
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
    </div>
  );
}
