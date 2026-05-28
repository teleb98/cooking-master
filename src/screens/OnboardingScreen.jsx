import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DAYS_KR, FOOD_CHIPS, ALLERGY_CHIPS } from '../data';
import { useApp } from '../context/AppContext';
// apiFetch throws with status attached; 402 triggers upgrade sheet
import { useFamily, getChildCategory } from '../context/FamilyContext';
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
  const { accent, markOnboarded, showUpgrade } = useApp();
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
  const [shopday, setShopday]         = useState(profile.shopping_day ?? 6);
  const [saving, setSaving]           = useState(false);
  const [errMsg, setErrMsg]           = useState('');

  /* ── 자녀 배열 — 기존 단일 아기 데이터 마이그레이션 ── */
  const initChildren = () => {
    if (Array.isArray(profile.children) && profile.children.length > 0) return profile.children;
    if (profile.baby_birthday) return [{ id: 'c0', name: profile.baby_name ?? '', birthday: profile.baby_birthday }];
    return [{ id: 'c0', name: '', birthday: defaultBday }];
  };
  const [children, setChildren] = useState(initChildren);
  const addChild    = () => setChildren(p => [...p, { id: `c${Date.now()}`, name: '', birthday: defaultBday }]);
  const removeChild = (id) => setChildren(p => p.filter(c => c.id !== id));
  const updateChild = (id, field, val) => setChildren(p => p.map(c => c.id === id ? { ...c, [field]: val } : c));

  /* ── 취향 설문 상태 ── */
  const [likes, setLikes]   = useState(new Set(profile.food_likes ?? []));
  const [avoids, setAvoids] = useState(new Set(profile.allergies  ?? []));

  const toggleLike  = (item) => setLikes(prev  => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s; });
  const toggleAvoid = (item) => setAvoids(prev => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s; });

  /* ── 식단 생성 상태 ── */
  const [genState, setGenState] = useState('idle'); // 'idle'|'loading'|'done'|'error'
  const [genPlan,  setGenPlan]  = useState([]);
  const [genErr,   setGenErr]   = useState('');
  const [showWelcome, setShowWelcome] = useState(false);

  /* ── 스텝 계산 ── */
  const steps = useMemo(() => {
    const s = [{ key: 'preferences', label: '취향 설문' }];
    s.push({ key: 'type', label: '사용 유형' });
    if (type === 'couple' || type === 'family') s.push({ key: 'members', label: '가족 이름' });
    if (type === 'family') s.push({ key: 'baby', label: '자녀 정보' });
    s.push({ key: 'shopday', label: '장보는 요일' });
    s.push({ key: 'generate', label: '식단 생성' });
    return s;
  }, [type]);

  const totalSteps = steps.length;
  const currentKey = steps[step]?.key ?? 'generate';
  const isLast     = step === totalSteps - 1;
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
      if (err.status === 402) {
        setGenState('error');
        setGenErr('이번 달 AI 식단 생성 횟수를 모두 사용했습니다.');
        showUpgrade({ type: 'generate', isPremium: false, used: 1, limit: 1 });
      } else {
        setGenErr(err.message || '식단 생성에 실패했어요.');
        setGenState('error');
      }
    }
  }, [showUpgrade]);

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
        const validChildren = type === 'family'
          ? children.filter(c => c.birthday).map(c => ({ id: c.id, name: c.name, birthday: c.birthday }))
          : [];
        const firstBaby = validChildren.find(c => getChildCategory(c.birthday).isBaby);
        await saveProfile({
          family_type:   type,
          partner_name:  (type === 'couple' || type === 'family') ? (partnerName.trim() || null) : null,
          children:      validChildren,
          baby_birthday: firstBaby?.birthday ?? null,
          baby_name:     firstBaby?.name ?? null,
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

    // generate 스텝 완료 (확정) — 환영 오버레이 표시 후 window.location으로 완전 재로드
    if (currentKey === 'generate') {
      setShowWelcome(true);
      setTimeout(() => {
        markOnboarded();
        window.location.replace('/calendar');
      }, 2000);
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
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* ── 온보딩 완료 환영 오버레이 ── */}
      {showWelcome && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'var(--bg)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 24,
          animation: 'welcomeFadeIn 350ms cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <div style={{
            width: 88, height: 88, borderRadius: 26,
            background: accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 16px 40px ${accent}55`,
          }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              환영해요{myName ? `, ${myName}님` : ''}!
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
              2주 식단이 준비됐어요<br />캘린더에서 확인해 보세요 🎉
            </div>
          </div>
          <style>{`
            @keyframes welcomeFadeIn {
              from { opacity: 0; transform: scale(0.92); }
              to   { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
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
          onClick={() => { markOnboarded(); window.location.replace('/calendar'); }}
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

      {/* 콘텐츠 — minHeight:0 필수: flex child에서 overflow:auto가 동작하려면 기본 min-height:auto를 0으로 덮어야 함 */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 20px 24px' }}>

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

        {/* ── STEP: 자녀 정보 (다자녀 지원) ── */}
        {currentKey === 'baby' && (
          <div>
            <Hero kr="자녀 정보를 입력하세요" en="Tell us about your children" sub="이유식·유아 단계가 자동 계산되어 식단에 분기됩니다." />
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {children.map((child, idx) => {
                const cat = child.birthday ? getChildCategory(child.birthday) : null;
                return (
                  <div key={child.id} style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>자녀 {idx + 1}</span>
                      {children.length > 1 && (
                        <button onClick={() => removeChild(child.id)} style={{ color: 'var(--ink-4)', fontSize: 12 }}>삭제</button>
                      )}
                    </div>
                    <NameInput
                      labelEn="NAME · 이름"
                      value={child.name}
                      onChange={v => updateChild(child.id, 'name', v)}
                      placeholder="이름 입력 (선택)"
                    />
                    <div style={{ marginTop: 14 }}>
                      <div className="kr-en">BIRTHDAY · 생년월일</div>
                      <input
                        type="date"
                        value={child.birthday}
                        onChange={e => updateChild(child.id, 'birthday', e.target.value)}
                        style={{
                          marginTop: 6, width: '100%', padding: '12px 14px', borderRadius: 10,
                          border: '1px solid var(--line)', background: 'var(--bg)',
                          fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--ink)', outline: 'none',
                        }}
                      />
                    </div>
                    {cat && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                        <span style={{ fontSize: 20 }}>{cat.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{cat.label}</div>
                          {cat.isBaby && (
                            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>이유식 분기 식단이 자동 적용됩니다</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {children.length < 4 && (
                <button
                  onClick={addChild}
                  style={{
                    padding: '13px 0', borderRadius: 12,
                    border: '1.5px dashed var(--line)', background: 'transparent',
                    color: 'var(--ink-3)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  + 자녀 추가
                </button>
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
                genState === 'done'  ? `총 ${genPlan.length}개 식단이 준비됐어요` :
                genState === 'error' ? genErr :
                                      '취향 정보를 바탕으로 Gemini AI가 메뉴를 선정합니다'
              }
            />

            {/* 생성 완료 시 확정 버튼을 콘텐츠 상단에 노출 — 스크롤 없이 항상 보임 */}
            {genState === 'done' && (
              <button
                onClick={next}
                style={{
                  marginTop: 18, width: '100%', padding: '15px 0', borderRadius: 14,
                  background: accent, color: '#fff',
                  fontSize: 15, fontWeight: 700,
                  boxShadow: `0 6px 18px ${accent}4D`,
                }}
              >
                확정하고 시작하기 →
              </button>
            )}

            {genState === 'loading' && (
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="var(--line)" strokeWidth="2.5"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke={accent} strokeWidth="2.5" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                  </path>
                </svg>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>AI가 맞춤 식단을 구성하는 중…</span>
              </div>
            )}

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
                  marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 12,
                  border: '1px solid var(--line)', background: 'transparent',
                  color: 'var(--ink-3)', fontSize: 13, fontWeight: 500,
                }}
              >
                마음에 안 들어요 · 재생성
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

      {/* CTA 버튼 — generate/done 스텝은 콘텐츠 내부 버튼이 담당하므로 숨김 */}
      {!(currentKey === 'generate' && genState === 'done') && (
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
      )}
    </div>
  );
}
