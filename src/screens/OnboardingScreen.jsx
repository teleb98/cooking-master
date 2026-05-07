import { useState, useMemo, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { DAYS_KR, FOOD_CHIPS, ALLERGY_CHIPS } from '../data';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { useAuth } from '../context/AuthContext';
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}

/* ── 공통 컴포넌트 ───────────────────────────────────────── */
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

function NameInput({ labelEn, value, onChange, placeholder }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="kr-en">{labelEn}</div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          marginTop: 6, width: '100%', padding: '13px 14px', borderRadius: 10,
          border: '1px solid var(--line)', background: 'var(--bg)',
          fontSize: 16, color: 'var(--ink)', outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

function Chip({ label, selected, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
        background: selected ? color : 'var(--surface)',
        color: selected ? '#fff' : 'var(--ink-2)',
        border: selected ? 'none' : '1px solid var(--line)',
        transition: 'background 120ms, color 120ms',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function calcBaby(bday) {
  if (!bday) return null;
  const months = Math.floor((Date.now() - new Date(bday)) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 6)  return { months, stage: '초기',  en: 'Early-stage',    hint: '미음·쌀죽 위주 · 알레르기 주의',    idx: 0 };
  if (months < 9)  return { months, stage: '중기',  en: 'Mid-stage',      hint: '죽 → 무른 밥 · 단백질 도입 시기',   idx: 1 };
  if (months < 12) return { months, stage: '후기',  en: 'Late-stage',     hint: '다양한 식재료 · 손가락 음식 시작',   idx: 2 };
  return             { months, stage: '완료기', en: 'Complete-stage', hint: '가족 식사 합류 가능 · 간은 최소화', idx: 3 };
}

/* ── 2주 미니 캘린더 프리뷰 ─────────────────────────────── */
function MiniCalendar({ plan, loading, accent }) {
  const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
  const today = new Date();
  const dow = today.getUTCDay() === 0 ? 6 : today.getUTCDay() - 1;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - dow);
  monday.setUTCHours(0, 0, 0, 0);

  const weeks = [0, 1].map(w =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + w * 7 + i);
      return d.toISOString().slice(0, 10);
    })
  );

  const mealMap = {};
  for (const e of plan) {
    mealMap[`${e.plan_date}_${e.meal_type}`] = e.menu_name;
  }

  const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

  return (
    <div style={{ marginTop: 18 }}>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
              {wi === 0 ? '이번 주' : '다음 주'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
              {week[0].slice(5).replace('-', '/')} – {week[6].slice(5).replace('-', '/')}
            </span>
          </div>
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--ink-4)', fontWeight: 600 }}>{d}</div>
            ))}
          </div>
          {/* 식단 셀 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {week.map(date => (
              <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {MEAL_TYPES.map((mt, mi) => {
                  const name = mealMap[`${date}_${mt}`];
                  const colors = ['var(--baby-soft)', `${accent}22`, 'var(--warn-soft)'];
                  const textColors = ['var(--baby-ink)', accent, 'var(--warn)'];
                  return (
                    <div key={mt} style={{
                      height: 18,
                      borderRadius: 4,
                      background: loading
                        ? 'var(--line-soft)'
                        : name ? colors[mi] : 'var(--line-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                      animation: loading ? 'skeletonPulse 1.4s ease-in-out infinite' : 'none',
                      animationDelay: loading ? `${(mi * 0.1).toFixed(1)}s` : '0s',
                    }}>
                      {!loading && name && (
                        <span style={{
                          fontSize: 6.5, fontWeight: 600,
                          color: textColors[mi],
                          overflow: 'hidden', whiteSpace: 'nowrap',
                          padding: '0 2px',
                        }}>
                          {name.slice(0, 5)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default function OnboardingScreen() {
  const { accent, markOnboarded } = useApp();
  const { saveProfile, profile } = useFamily();
  const { user } = useAuth();
  const navigate = useNavigate();

  const defaultBday = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 8);
    return d.toISOString().slice(0, 10);
  })();

  /* ── 기존 프로필로 초기화 ── */
  const [step, setStep]               = useState(0);
  const [type, setType]               = useState(profile.family_type ?? 'couple');
  const [partnerName, setPartnerName] = useState(profile.partner_name ?? '');
  const [babyName, setBabyName]       = useState(profile.baby_name ?? '');
  const [shopday, setShopday]         = useState(profile.shopping_day ?? 6);
  const [bday, setBday]               = useState(profile.baby_birthday ?? defaultBday);
  const [saving, setSaving]           = useState(false);
  const [errMsg, setErrMsg]           = useState('');

  /* ── 취향 설문 상태 ── */
  const [likes, setLikes]   = useState(new Set(profile.food_likes ?? []));
  const [avoids, setAvoids] = useState(new Set(profile.allergies  ?? []));

  const toggleLike  = (item) => setLikes(prev  => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s; });
  const toggleAvoid = (item) => setAvoids(prev => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s; });

  /* ── 식단 생성 상태 ── */
  const [genState, setGenState] = useState('idle'); // 'idle'|'loading'|'done'|'error'
  const [genPlan,  setGenPlan]  = useState([]);
  const [genErr,   setGenErr]   = useState('');

  /* ── 스텝 계산 ── */
  const steps = useMemo(() => {
    const s = [{ key: 'preferences', label: '취향 설문' }];
    s.push({ key: 'type', label: '사용 유형' });
    if (type === 'couple' || type === 'family') s.push({ key: 'members', label: '가족 이름' });
    if (type === 'family') s.push({ key: 'baby', label: '아기 정보' });
    s.push({ key: 'shopday', label: '장보는 요일' });
    s.push({ key: 'generate', label: '식단 생성' });
    return s;
  }, [type]);

  const totalSteps = steps.length;
  const currentKey = steps[step]?.key ?? 'generate';
  const isLast     = step === totalSteps - 1;
  const baby       = calcBaby(bday);
  const myName     = user?.name ?? '';

  /* ── 식단 생성 트리거 ── */
  const triggerGenerate = useCallback(async () => {
    setGenState('loading');
    setGenErr('');
    setGenPlan([]);
    try {
      const data = await apiFetch('/ai/generate-plan', { method: 'POST' });
      setGenPlan(data.plan ?? []);
      setGenState('done');
    } catch (err) {
      setGenErr(err.message || '식단 생성에 실패했어요.');
      setGenState('error');
    }
  }, []);

  // generate 스텝 진입 시 자동 실행
  useEffect(() => {
    if (currentKey === 'generate' && genState === 'idle') {
      triggerGenerate();
    }
  }, [currentKey, genState, triggerGenerate]);

  /* ── 네비게이션 ── */
  const next = async () => {
    setErrMsg('');

    // shopday → generate 스텝 전환 시 프로필 저장
    if (currentKey === 'shopday') {
      setSaving(true);
      try {
        await saveProfile({
          family_type:   type,
          partner_name:  (type === 'couple' || type === 'family') ? (partnerName.trim() || null) : null,
          baby_birthday: type === 'family' ? bday : null,
          baby_name:     type === 'family' ? (babyName.trim() || null) : null,
          shopping_day:  shopday,
          food_likes:    Array.from(likes),
          allergies:     Array.from(avoids),
        });
      } catch {
        setErrMsg('저장에 실패했어요. 다시 시도해주세요.');
        setSaving(false);
        return;
      }
      setSaving(false);
      setStep(s => s + 1);
      return;
    }

    // generate 스텝 완료 (확정)
    if (currentKey === 'generate') {
      flushSync(() => markOnboarded());
      navigate('/');
      return;
    }

    setStep(s => s + 1);
  };

  const prev = () => step > 0 ? setStep(s => s - 1) : navigate(-1);

  /* ── generate 스텝의 CTA 레이블 ── */
  const ctaLabel = () => {
    if (saving) return '저장 중…';
    if (currentKey === 'generate') {
      if (genState === 'loading') return 'AI 생성 중…';
      if (genState === 'error')   return '건너뛰고 시작하기';
      return '확정 · Confirm';
    }
    return isLast ? '완료 · Finish' : '다음 · Next';
  };

  const ctaDisabled = saving || (currentKey === 'generate' && genState === 'loading');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* 상단 바 */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={prev} style={{ color: 'var(--ink-2)' }}>{Icon.back(20)}</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="kr-en">
            {currentKey === 'generate' ? 'AI 생성 · Auto plan' : `STEP ${step + 1} / ${totalSteps} · 온보딩`}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{steps[step]?.label}</div>
        </div>
        <button
          onClick={() => { flushSync(() => markOnboarded()); navigate('/'); }}
          style={{ color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}
        >건너뛰기</button>
      </div>

      {/* 진행 바 */}
      <div style={{ padding: '0 18px 20px', display: 'flex', gap: 4 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < step ? 'var(--baby)' : i === step ? accent : 'var(--line)',
            transition: 'background 200ms',
          }} />
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 24px' }}>

        {/* ── STEP: 취향 설문 ── */}
        {currentKey === 'preferences' && (
          <div>
            <Hero
              kr="취향을 알려주세요"
              en="Likes · dislikes · allergies"
              sub="선택한 정보로 AI가 맞춤 식단을 구성합니다. 건너뛰어도 됩니다."
            />

            {/* 좋아하는 음식 */}
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>좋아하는 재료</span>
                <span className="kr-en">Favorites</span>
                {likes.size > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: accent, fontWeight: 700 }}>{likes.size}개 선택</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FOOD_CHIPS.map(item => (
                  <Chip
                    key={item}
                    label={item}
                    selected={likes.has(item)}
                    color={accent}
                    onClick={() => toggleLike(item)}
                  />
                ))}
              </div>
            </div>

            {/* 알레르기 */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>알레르기 · 피하는 재료</span>
                <span className="kr-en">Avoid</span>
                {avoids.size > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#C0392B', fontWeight: 700 }}>{avoids.size}개 선택</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALLERGY_CHIPS.map(item => (
                  <Chip
                    key={item}
                    label={item}
                    selected={avoids.has(item)}
                    color="#C0392B"
                    onClick={() => toggleAvoid(item)}
                  />
                ))}
              </div>
            </div>

            {(likes.size > 0 || avoids.size > 0) && (
              <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 12 }}>
                {likes.size > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                    <span style={{ color: accent, fontWeight: 700 }}>좋아요</span> {[...likes].join(' · ')}
                  </div>
                )}
                {avoids.size > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6, marginTop: likes.size > 0 ? 4 : 0 }}>
                    <span style={{ color: '#C0392B', fontWeight: 700 }}>피해요</span> {[...avoids].join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP: 사용 유형 ── */}
        {currentKey === 'type' && (
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

        {/* ── STEP: 가족 이름 ── */}
        {currentKey === 'members' && (
          <div>
            <Hero kr="함께하는 분의 이름을 알려주세요" en="Who are you cooking with?" sub="앱 내 호칭으로 사용됩니다." />
            <div style={{ marginTop: 18, padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <div className="kr-en">나 · Me</div>
              <div style={{
                marginTop: 6, padding: '13px 14px', borderRadius: 10,
                border: '1px solid var(--line)', background: 'var(--bg-2)',
                fontSize: 16, color: 'var(--ink-3)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: accent, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>{myName[0] ?? '나'}</div>
                <span style={{ color: 'var(--ink)' }}>{myName || '소셜 로그인 계정'}</span>
              </div>
              <NameInput
                labelEn="PARTNER · 파트너"
                value={partnerName}
                onChange={setPartnerName}
                placeholder="이름 입력 (선택)"
              />
            </div>
          </div>
        )}

        {/* ── STEP: 아기 정보 ── */}
        {currentKey === 'baby' && (
          <div>
            <Hero kr="아기 정보를 입력하세요" en="Tell us about your baby" sub="이유식 단계가 자동 계산되어 식단에 분기됩니다." />
            <div style={{ marginTop: 18, padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <NameInput
                labelEn="BABY NAME · 아기 이름"
                value={babyName}
                onChange={setBabyName}
                placeholder="이름 입력 (선택)"
              />
              <div style={{ marginTop: 18 }}>
                <div className="kr-en">BIRTHDAY · 생년월일</div>
                <input
                  type="date"
                  value={bday}
                  onChange={e => setBday(e.target.value)}
                  style={{
                    marginTop: 6, width: '100%', padding: '12px 14px', borderRadius: 10,
                    border: '1px solid var(--line)', background: 'var(--bg)',
                    fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--ink)', outline: 'none',
                  }}
                />
              </div>
              {baby && (
                <>
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--baby-soft)', color: 'var(--baby-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {Icon.baby(22)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{baby.months}개월 · {baby.stage} ({baby.en})</div>
                      <div className="kr-en" style={{ marginTop: 2 }}>{baby.hint}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, background: 'var(--bg)', padding: 4, borderRadius: 10 }}>
                    {['초기', '중기', '후기', '완료기'].map((s, i) => (
                      <div key={s} style={{
                        padding: '9px 0', textAlign: 'center', borderRadius: 7,
                        background: i === baby.idx ? accent : 'transparent',
                        color: i === baby.idx ? '#fff' : 'var(--ink-3)',
                        fontSize: 11, fontWeight: 600, transition: 'background 200ms',
                      }}>{s}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: 장보는 요일 ── */}
        {currentKey === 'shopday' && (
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
                  { d: 'D+1', label: '잎채소·생선',   color: 'var(--baby)' },
                  { d: 'D+3', label: '육류·과일',     color: '#A8B86D'     },
                  { d: 'D+5', label: '뿌리채소·달걀', color: 'var(--warn)' },
                ].map(r => (
                  <div key={r.d} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', width: 32 }}>{r.d}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink-3)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: 식단 생성 ── */}
        {currentKey === 'generate' && (
          <div>
            <Hero
              kr={
                genState === 'loading' ? 'AI가 식단을 만들고 있어요' :
                genState === 'done'    ? '2주 식단이 완성됐어요!' :
                                        '식단 생성에 실패했어요'
              }
              en={
                genState === 'loading' ? 'Generating your 2-week plan…' :
                genState === 'done'    ? 'Your personalized plan is ready!' :
                                        'Generation failed'
              }
              sub={
                genState === 'done'   ? `총 ${genPlan.length}개 식단 · 마음에 들지 않으면 재생성하세요` :
                genState === 'error'  ? genErr :
                                       '취향 정보를 바탕으로 Gemini AI가 메뉴를 선정합니다'
              }
            />

            {genState !== 'error' && (
              <MiniCalendar
                plan={genPlan}
                loading={genState === 'loading'}
                accent={accent}
              />
            )}

            {genState === 'error' && (
              <div style={{ marginTop: 20, padding: '16px', background: 'var(--warn-soft)', borderRadius: 14, border: '1px solid var(--warn)' }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  홈 화면에서 AI 채팅으로 식단을 요청할 수 있어요.
                </div>
              </div>
            )}

            {genState === 'done' && (
              <button
                onClick={() => { setGenState('idle'); }}
                style={{
                  marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12,
                  border: `1px solid ${accent}`, background: 'transparent',
                  color: accent, fontSize: 13, fontWeight: 700,
                }}
              >
                재생성
              </button>
            )}
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {errMsg && (
        <div style={{ margin: '0 18px 8px', padding: '10px 14px', borderRadius: 10, background: '#FFF0ED', border: '1px solid #FBBCAC', fontSize: 13, color: '#8B3A2A' }}>
          {errMsg}
        </div>
      )}

      {/* CTA 버튼 */}
      <div style={{ padding: '12px 18px', paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={next} disabled={ctaDisabled} style={{
          width: '100%', padding: '15px 0', borderRadius: 14,
          background: ctaDisabled ? 'var(--ink-4)' : accent,
          color: '#fff', fontSize: 15, fontWeight: 700,
          boxShadow: ctaDisabled ? 'none' : `0 6px 18px ${accent}4D`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background 150ms',
        }}>
          {genState === 'loading' && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
              </path>
            </svg>
          )}
          {ctaLabel()}
        </button>
      </div>
    </div>
  );
}
