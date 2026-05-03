import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DAYS_KR } from '../data';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import Icon from '../icons';

function Hero({ kr, en, sub }) {
  return (
    <div style={{ paddingTop: 16 }}>
      <div className="kr-en">{en}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{kr}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.55 }}>{sub}</div>}
    </div>
  );
}

function TypeCard({ kr, en, desc, active, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: 16, borderRadius: 14,
      background: active ? '#FBEFEA' : 'var(--surface)',
      border: active ? `1.5px solid ${accent}` : '1px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: 14, width: '100%',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        border: active ? `6px solid ${accent}` : '1.5px solid var(--line)',
        background: active ? '#fff' : 'var(--surface)',
        transition: 'border 150ms',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{kr}</span>
          <span className="kr-en">{en}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
      </div>
    </button>
  );
}

export default function OnboardingScreen() {
  const { accent } = useApp();
  const { saveProfile } = useFamily();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [type, setType] = useState('couple');
  const [bday, setBday] = useState('2024-09-06');
  const [shopday, setShopday] = useState(6);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const steps = ['사용 유형', '파트너 초대', '아기 정보', '장보는 요일'];

  const next = async () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      setSaving(true);
      await saveProfile({
        family_type:   type,
        baby_birthday: type === 'family' ? bday : null,
        shopping_day:  shopday,
      });
      localStorage.setItem('cookingMaster_onboarded', '1');
      navigate('/');
    }
  };
  const prev = () => step > 0 ? setStep(step - 1) : navigate(-1);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Top bar */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={prev} style={{ color: 'var(--ink-2)' }}>{Icon.back(20)}</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="kr-en">STEP {step + 3} / 5 · 패밀리 설정</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{steps[step]}</div>
        </div>
        <button onClick={() => navigate('/')} style={{ color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>건너뛰기</button>
      </div>

      {/* Progress bars */}
      <div style={{ padding: '0 18px 20px', display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3, 4].map(i => {
          const filledIdx = step + 2;
          const state = i < filledIdx ? 'done' : i === filledIdx ? 'curr' : 'todo';
          return (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: state === 'done' ? 'var(--baby)' : state === 'curr' ? accent : 'var(--line)',
              transition: 'background 200ms',
            }} />
          );
        })}
      </div>

      {/* Content */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 24px' }}>
        {step === 0 && (
          <div>
            <Hero kr="누구와 함께 사용하나요?" en="Who's cooking with you?" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {[
                { id: 'solo',   kr: '혼자',  en: 'Solo',   desc: '1인 식단 · 개인 취향' },
                { id: 'couple', kr: '커플',  en: 'Couple', desc: '두 사람 취향 합산 · 공동 장보기' },
                { id: 'family', kr: '가족',  en: 'Family', desc: '부부 + 아기 · 이유식 자동 분기' },
              ].map(opt => (
                <TypeCard key={opt.id} {...opt} active={type === opt.id} onClick={() => setType(opt.id)} accent={accent} />
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <Hero kr="파트너를 초대하세요" en="Invite your partner" sub="가입 후 두 사람의 취향이 합산되어 식단이 다시 생성됩니다." />
            <div style={{ marginTop: 18, padding: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <div className="kr-en">초대 링크 · Invite link</div>
              <div style={{ marginTop: 8, padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px dashed var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <code style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', wordBreak: 'break-all' }}>
                  cooking.app/i/4f2a-9b1c
                </code>
                <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{
                  padding: '7px 11px', borderRadius: 8, background: copied ? 'var(--baby)' : accent, color: '#fff',
                  fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  transition: 'background 200ms',
                }}>
                  {copied ? Icon.check(12) : Icon.copy(12)} {copied ? '복사됨' : '복사'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--ink-3)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', flexShrink: 0 }} />
                24시간 후 만료 · expires in 24h
              </div>
            </div>
            <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-2)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 15, flexShrink: 0 }}>?</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>초대 수락 후 파트너의 알레르기·기피 식재료가 자동 반영됩니다.</div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <Hero kr="아기가 있나요?" en="Tell us about your baby" sub="이유식 단계가 자동 계산되어 식단에 분기됩니다." />
            <div style={{ marginTop: 18, padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <div className="kr-en">생년월일 · Birthday</div>
              <input type="date" value={bday} onChange={e => setBday(e.target.value)} style={{
                marginTop: 8, width: '100%', padding: '12px 14px', borderRadius: 10,
                border: '1px solid var(--line)', background: 'var(--bg)',
                fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--ink)', outline: 'none',
              }} />
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--baby-soft)', color: 'var(--baby-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {Icon.baby(22)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>8개월 · 중기 (Mid-stage)</div>
                  <div className="kr-en" style={{ marginTop: 2 }}>죽 → 무른 밥 · 단백질 도입 시기</div>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, background: 'var(--bg)', padding: 4, borderRadius: 10 }}>
                {['초기', '중기', '후기', '완료기'].map((s, i) => (
                  <div key={s} style={{
                    padding: '9px 0', textAlign: 'center', borderRadius: 7,
                    background: i === 1 ? accent : 'transparent',
                    color: i === 1 ? '#fff' : 'var(--ink-3)',
                    fontSize: 11, fontWeight: 600, transition: 'background 200ms',
                  }}>{s}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <Hero kr="장 보는 요일은?" en="When do you grocery shop?" sub="신선도가 높은 재료를 가까운 날짜에 배치합니다." />
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {DAYS_KR.map((d, i) => (
                <button key={d} onClick={() => setShopday(i)} style={{
                  padding: '14px 0', borderRadius: 12,
                  background: i === shopday ? 'var(--ink)' : 'var(--surface)',
                  color: i === shopday ? '#fff' : 'var(--ink-2)',
                  border: i === shopday ? 'none' : '1px solid var(--line)',
                  fontSize: 14, fontWeight: 700, transition: 'background 150ms, color 150ms',
                }}>{d}</button>
              ))}
            </div>
            <div style={{ marginTop: 18, padding: 14, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--line)' }}>
              <div className="kr-en">신선도 배치 미리보기</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { d: 'D+1', kr: '월', label: '잎채소·생선', color: 'var(--baby)' },
                  { d: 'D+3', kr: '수', label: '육류·과일', color: '#A8B86D' },
                  { d: 'D+5', kr: '금', label: '뿌리채소·달걀', color: 'var(--warn)' },
                ].map(r => (
                  <div key={r.d} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', width: 32 }}>{r.d}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.kr}</span>
                    <span style={{ color: 'var(--ink-3)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 18px', paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))', display: 'flex', gap: 8 }}>
        <button onClick={next} disabled={saving} style={{
          flex: 1, padding: '15px 0', borderRadius: 14, background: accent, color: '#fff',
          fontSize: 15, fontWeight: 700, boxShadow: `0 6px 18px ${accent}4D`,
          opacity: saving ? 0.7 : 1,
        }}>
          {saving ? '저장 중…' : step < 3 ? '다음 · Next' : '완료 · Finish'}
        </button>
      </div>
    </div>
  );
}
