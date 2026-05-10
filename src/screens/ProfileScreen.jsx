import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../context/FamilyContext';
import { FOOD_CHIPS, ALLERGY_CHIPS } from '../data';

const FOOD_CHIPS_SET = new Set(FOOD_CHIPS);
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';

const PRESET_ACCENTS = [
  { name: '테라코타', value: '#C8654A' },
  { name: '세이지',   value: '#6F8E5A' },
  { name: '인디고',   value: '#3F4D8A' },
  { name: '머스타드', value: '#C9943C' },
  { name: '먹',      value: '#2A2A28' },
];

const PROVIDER_LABEL = {
  google:   { label: 'Google',    color: '#4285F4', bg: '#EAF0FF' },
  kakao:    { label: 'KakaoTalk', color: '#7A5E00', bg: '#FEF6C2' },
  naver:    { label: 'Naver',     color: '#007F3F', bg: '#D6F5E3' },
  facebook: { label: 'Facebook',  color: '#1877F2', bg: '#E7F0FD' },
};

const AVATAR_COLORS = ['#C8654A', '#6F8E5A', '#3F4D8A', '#C9943C'];
const DAYS_KR = ['월', '화', '수', '목', '금', '토', '일'];

function Avatar({ name, size = 44, colorIdx = 0 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: AVATAR_COLORS[colorIdx % AVATAR_COLORS.length],
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700,
    }}>
      {(name ?? '?')[0]}
    </div>
  );
}

function MemberRow({ name, role, colorIdx }) {
  const roleLabel = { owner: '나', partner: '파트너', baby: '아기' }[role] ?? role;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <Avatar name={name} size={38} colorIdx={colorIdx} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
        <div className="kr-en" style={{ marginTop: 1 }}>{roleLabel}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '12px 14px', boxSizing: 'border-box',
        background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12,
        fontSize: 14, color: 'var(--ink)', outline: 'none',
      }}
    />
  );
}

/* ── 회원 탈퇴 확인 시트 ─────────────────────────────────── */
function DeleteAccountSheet({ open, onClose, onConfirm }) {
  const [step, setStep]       = useState('warn');   // 'warn' | 'confirm'
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) { setStep('warn'); setDeleting(false); }
  }, [open]);

  if (!open) return null;

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', zIndex: 400,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#C0392B' }}>회원 탈퇴</div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)' }}>{Icon.close(18)}</button>
        </div>

        <div style={{ padding: '20px 20px 24px' }}>
          {step === 'warn' ? (
            <>
              {/* 경고 아이콘 */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: '#FEF2F0', color: '#C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {Icon.warn(20)}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>탈퇴하면 모든 데이터가 삭제됩니다</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>삭제된 데이터는 복구할 수 없습니다.</div>
                </div>
              </div>

              {/* 삭제 항목 목록 */}
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                {[
                  '계정 정보 (이름, 이메일)',
                  '2주치 식단 계획 전체',
                  '장보기 목록',
                  '가족 구성 및 취향 설정',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#C0392B', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{item}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={{
                  flex: 1, padding: '13px 0', borderRadius: 12,
                  border: '1px solid var(--line)', background: 'var(--bg)',
                  fontSize: 14, fontWeight: 600, color: 'var(--ink-2)',
                }}>취소</button>
                <button onClick={() => setStep('confirm')} style={{
                  flex: 1, padding: '13px 0', borderRadius: 12,
                  background: '#FEF2F0', border: '1px solid #F5C6C0',
                  fontSize: 14, fontWeight: 700, color: '#C0392B',
                }}>계속 진행</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>정말로 탈퇴하시겠어요?</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.65, marginBottom: 24 }}>
                이 작업은 되돌릴 수 없습니다. 탈퇴 후 같은 소셜 계정으로 재가입하더라도 이전 데이터는 복구되지 않습니다.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setStep('warn')} style={{
                  flex: 1, padding: '13px 0', borderRadius: 12,
                  border: '1px solid var(--line)', background: 'var(--bg)',
                  fontSize: 14, fontWeight: 600, color: 'var(--ink-2)',
                }}>돌아가기</button>
                <button onClick={handleDelete} disabled={deleting} style={{
                  flex: 1, padding: '13px 0', borderRadius: 12,
                  background: deleting ? 'var(--ink-4)' : '#C0392B',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  {deleting && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                      </path>
                    </svg>
                  )}
                  {deleting ? '탈퇴 처리 중…' : '탈퇴하기'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 가족 설정 편집 시트 ──────────────────────────────────── */
function FamilyEditSheet({ open, profile, accent, onSave, onClose }) {
  const [type, setType]           = useState(profile.family_type ?? 'couple');
  const [partnerName, setPartner] = useState(profile.partner_name ?? '');
  const [babyName, setBabyName]   = useState(profile.baby_name ?? '');
  const [babyBday, setBabyBday]   = useState(profile.baby_birthday ?? '');
  const [shopday, setShopday]     = useState(profile.shopping_day ?? 6);
  const [likes, setLikes]         = useState(new Set(profile.food_likes ?? []));
  const [avoids, setAvoids]       = useState(new Set(profile.allergies  ?? []));
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (open) {
      setType(profile.family_type ?? 'couple');
      setPartner(profile.partner_name ?? '');
      setBabyName(profile.baby_name ?? '');
      setBabyBday(profile.baby_birthday ?? '');
      setShopday(profile.shopping_day ?? 6);
      setLikes(new Set(profile.food_likes ?? []));
      setAvoids(new Set(profile.allergies  ?? []));
    }
  }, [open, profile]);

  const toggleLike  = (item) => setLikes(prev  => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s; });
  const toggleAvoid = (item) => setAvoids(prev => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s; });

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      family_type:   type,
      partner_name:  type !== 'solo' ? (partnerName || null) : null,
      baby_name:     type === 'family' ? (babyName || null) : null,
      baby_birthday: type === 'family' ? (babyBday || null) : null,
      shopping_day:  shopday,
      food_likes:    Array.from(likes),
      allergies:     Array.from(avoids),
    });
    setSaving(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end', zIndex: 300,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>가족 설정</div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)' }}>{Icon.close(18)}</button>
        </div>

        {/* 폼 */}
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* 가족 유형 */}
          <div style={{ marginBottom: 22 }}>
            <FieldLabel>가족 유형</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[{ key: 'solo', label: '1인' }, { key: 'couple', label: '커플' }, { key: 'family', label: '가족' }].map(opt => (
                <button key={opt.key} onClick={() => setType(opt.key)} style={{
                  padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  background: type === opt.key ? accent : 'var(--bg)',
                  color: type === opt.key ? '#fff' : 'var(--ink-2)',
                  border: type === opt.key ? 'none' : '1px solid var(--line)',
                  transition: 'background 150ms, color 150ms',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* 파트너 이름 */}
          {type !== 'solo' && (
            <div style={{ marginBottom: 22 }}>
              <FieldLabel>파트너 이름</FieldLabel>
              <TextInput value={partnerName} onChange={setPartner} placeholder="파트너 이름 입력" />
            </div>
          )}

          {/* 아기 정보 */}
          {type === 'family' && (
            <div style={{ marginBottom: 22 }}>
              <FieldLabel>아기 정보 (선택)</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <TextInput value={babyName} onChange={setBabyName} placeholder="아기 이름 (선택)" />
                <input
                  type="date"
                  value={babyBday}
                  onChange={e => setBabyBday(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12,
                    fontSize: 14, color: babyBday ? 'var(--ink)' : 'var(--ink-3)', outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* 좋아하는 메뉴 */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <FieldLabel>좋아하는 메뉴</FieldLabel>
              {Array.from(likes).filter(l => !FOOD_CHIPS_SET.has(l)).length > 0 && (
                <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>
                  {Array.from(likes).filter(l => !FOOD_CHIPS_SET.has(l)).length}개
                </span>
              )}
            </div>
            {Array.from(likes).filter(l => !FOOD_CHIPS_SET.has(l)).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '10px 0' }}>
                아직 추가된 메뉴가 없어요 · 레시피에서 추가해보세요
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {Array.from(likes).filter(l => !FOOD_CHIPS_SET.has(l)).map(item => (
                  <div key={item} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 10px 6px 12px', borderRadius: 999,
                    background: `${accent}18`, border: `1px solid ${accent}44`,
                  }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{item}</span>
                    <button
                      onClick={() => toggleLike(item)}
                      style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-4)', padding: 2 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 좋아하는 재료 */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <FieldLabel>좋아하는 재료</FieldLabel>
              {likes.size > 0 && <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>{likes.size}개 선택</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {FOOD_CHIPS.map(item => (
                <button key={item} onClick={() => toggleLike(item)} style={{
                  padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  background: likes.has(item) ? accent : 'var(--bg)',
                  color: likes.has(item) ? '#fff' : 'var(--ink-2)',
                  border: likes.has(item) ? 'none' : '1px solid var(--line)',
                  transition: 'background 120ms',
                }}>{item}</button>
              ))}
            </div>
          </div>

          {/* 알레르기 */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <FieldLabel>알레르기 · 피하는 재료</FieldLabel>
              {avoids.size > 0 && <span style={{ fontSize: 11, color: '#C0392B', fontWeight: 700 }}>{avoids.size}개 선택</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {ALLERGY_CHIPS.map(item => (
                <button key={item} onClick={() => toggleAvoid(item)} style={{
                  padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  background: avoids.has(item) ? '#C0392B' : 'var(--bg)',
                  color: avoids.has(item) ? '#fff' : 'var(--ink-2)',
                  border: avoids.has(item) ? 'none' : '1px solid var(--line)',
                  transition: 'background 120ms',
                }}>{item}</button>
              ))}
            </div>
          </div>

          {/* 장보는 요일 */}
          <div style={{ marginBottom: 8 }}>
            <FieldLabel>장보는 요일</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {DAYS_KR.map((d, i) => (
                <button key={i} onClick={() => setShopday(i)} style={{
                  padding: '11px 0', borderRadius: 10, fontWeight: 700, fontSize: 13,
                  background: shopday === i ? accent : 'var(--bg)',
                  color: shopday === i ? '#fff' : 'var(--ink-2)',
                  border: shopday === i ? 'none' : '1px solid var(--line)',
                  transition: 'background 150ms',
                }}>{d}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 저장/취소 */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '13px 0', borderRadius: 12,
            border: '1px solid var(--line)', background: 'var(--bg)',
            fontSize: 14, fontWeight: 600, color: 'var(--ink-2)',
          }}>취소</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 2, padding: '13px 0', borderRadius: 12,
            background: saving ? 'var(--ink-4)' : accent,
            color: '#fff', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {saving && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                </path>
              </svg>
            )}
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ────────────────────────────────────────── */
export default function ProfileScreen() {
  const { accent, setAccent, showToast } = useApp();
  const { user, logout } = useAuth();
  const { family, profile, members, saveProfile } = useFamily();
  const navigate = useNavigate();

  const [editOpen,     setEditOpen]     = useState(false);
  const [deleteOpen,   setDeleteOpen]   = useState(false);
  const [inviteState,  setInviteState]  = useState('idle');   // idle | loading | ready
  const [inviteUrl,    setInviteUrl]    = useState(null);
  const [inviteExp,    setInviteExp]    = useState(null);
  const [copied,       setCopied]       = useState(false);

  const loadInvite = async () => {
    setInviteState('loading');
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setInviteUrl(d.url);
      setInviteExp(d.expires_at);
      setInviteState('ready');
    } catch {
      showToast('초대 링크 생성에 실패했어요.');
      setInviteState('idle');
    }
  };

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('복사에 실패했어요. 링크를 직접 선택해 복사해주세요.');
    }
  };

  const shareLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.share({ title: 'Cooking Master 초대', text: '함께 식단을 관리해요!', url: inviteUrl });
    } catch { /* 취소 시 무시 */ }
  };

  const provider = user?.provider ? PROVIDER_LABEL[user.provider] : null;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleDeleteAccount = async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/user/profile', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast('탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
      return;
    }
    // 로컬 데이터 전체 삭제 후 로그인 화면으로
    await logout();
    localStorage.clear();
    navigate('/welcome', { replace: true });
  };

  const handleSaveProfile = async (updates) => {
    try {
      await saveProfile(updates);
      showToast('가족 설정이 저장되었어요', 'success');
    } catch {
      showToast('저장에 실패했어요. 다시 시도해주세요.');
    }
  };

  const memberRows = [];
  if (user?.name) memberRows.push({ name: user.name, role: 'owner', colorIdx: 0 });
  if (family.partner_name) memberRows.push({ name: family.partner_name, role: 'partner', colorIdx: 1 });

  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100%',
      padding: 'calc(env(safe-area-inset-top, 12px) + 12px) 18px calc(var(--nav-h) + env(safe-area-inset-bottom, 20px))',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 20 }}>설정</div>

      {/* 로그인 계정 카드 */}
      {user && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', padding: 16, marginBottom: 14 }}>
          <div className="kr-en" style={{ marginBottom: 10 }}>ACCOUNT · 내 계정</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={user.name} size={50} colorIdx={0} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{user.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
              {provider && (
                <span style={{
                  display: 'inline-block', marginTop: 6,
                  fontSize: 10, padding: '2px 8px', borderRadius: 6,
                  background: provider.bg, color: provider.color, fontWeight: 700,
                }}>
                  {provider.label}으로 로그인
                </span>
              )}
              {user.created_at && (
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>
                  가입일 {user.created_at.slice(0, 10)}
                </div>
              )}
            </div>
          </div>
          <button onClick={handleLogout} style={{
            marginTop: 14, width: '100%', padding: '11px 0', borderRadius: 10,
            border: '1px solid #F5C6C0', background: '#FEF2F0',
            fontSize: 13, fontWeight: 600, color: '#C0392B',
          }}>
            로그아웃
          </button>
        </div>
      )}

      {/* 가족 카드 */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', padding: 16, marginBottom: 14 }}>
        <div className="kr-en" style={{ marginBottom: 10 }}>FAMILY · 가족</div>

        {memberRows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {memberRows.map((m, i) => (
              <MemberRow key={m.name + i} {...m} />
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>
            패밀리 설정을 완료해주세요.
          </div>
        )}

        {/* 아기 정보 */}
        {family.has_baby && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--baby-soft)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--baby-ink)' }}>
            {Icon.baby(18)}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {family.baby_name ? `${family.baby_name} · ` : ''}{family.baby_months}개월 · {family.baby_stage}
              </div>
              <div className="kr-en" style={{ marginTop: 2 }}>이유식 자동 분기 활성화</div>
            </div>
          </div>
        )}

        {/* 유형 뱃지 */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {[
            { key: 'solo',   label: '1인' },
            { key: 'couple', label: '커플' },
            { key: 'family', label: '가족' },
          ].map(opt => (
            <span key={opt.key} style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: family.type === opt.key ? accent : 'var(--bg-2)',
              color: family.type === opt.key ? '#fff' : 'var(--ink-3)',
            }}>{opt.label}</span>
          ))}
        </div>

        <button onClick={() => setEditOpen(true)} style={{
          marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 10,
          border: '1px solid var(--line)', background: 'var(--bg)',
          fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
        }}>
          가족 설정 수정
        </button>
      </div>

      {/* 파트너 초대 */}
      {family.type !== 'solo' && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', padding: 16, marginBottom: 14 }}>
          <div className="kr-en" style={{ marginBottom: 12 }}>INVITE · 파트너 초대</div>

          {/* 파트너 멤버 목록 */}
          {members.filter(m => m.role !== 'owner').map((m, i) => (
            <div key={m.id} style={{ marginBottom: i < members.filter(x => x.role !== 'owner').length - 1 ? 12 : 0 }}>
              {/* 멤버 행 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m.status === 'pending' ? 10 : 0 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: m.status === 'active' ? accent : 'var(--bg-2)',
                  color: m.status === 'active' ? '#fff' : 'var(--ink-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700,
                }}>
                  {m.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{m.name}</div>
                  <div className="kr-en" style={{ marginTop: 1 }}>
                    {m.status === 'active' ? 'Connected partner' : 'Invite pending'}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 6, fontWeight: 700,
                  background: m.status === 'active' ? 'rgba(111,142,90,0.12)' : 'var(--bg-2)',
                  color: m.status === 'active' ? '#4A7A3A' : 'var(--ink-3)',
                }}>
                  {m.status === 'active' ? '연결됨' : '초대 대기'}
                </span>
              </div>

              {/* pending 멤버: 초대 링크 UI */}
              {m.status === 'pending' && (
                <>
                  {inviteState !== 'ready' && (
                    <button
                      onClick={loadInvite}
                      disabled={inviteState === 'loading'}
                      style={{
                        width: '100%', padding: '11px 0', borderRadius: 12,
                        background: inviteState === 'loading' ? 'var(--ink-4)' : accent,
                        color: '#fff', fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        boxShadow: inviteState === 'loading' ? 'none' : `0 4px 14px ${accent}4D`,
                      }}
                    >
                      {inviteState === 'loading' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                          </path>
                        </svg>
                      ) : Icon.spark(14)}
                      {inviteState === 'loading' ? '링크 생성 중…' : `${m.name}님 초대하기`}
                    </button>
                  )}

                  {inviteState === 'ready' && inviteUrl && (
                    <div>
                      <div style={{
                        background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10,
                        padding: '10px 12px', marginBottom: 8,
                        fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)',
                        wordBreak: 'break-all', lineHeight: 1.5,
                      }}>{inviteUrl}</div>
                      {inviteExp && (
                        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 8 }}>
                          {new Date(inviteExp).toLocaleDateString('ko-KR')}까지 유효 · 1회 사용
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={copyLink} style={{
                          flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                          background: copied ? 'rgba(111,142,90,0.12)' : 'var(--bg)',
                          color: copied ? '#4A7A3A' : 'var(--ink-2)',
                          border: `1px solid ${copied ? '#4A7A3A' : 'var(--line)'}`,
                          transition: 'all 200ms',
                        }}>
                          {copied ? '복사됨 ✓' : '링크 복사'}
                        </button>
                        {typeof navigator !== 'undefined' && navigator.share && (
                          <button onClick={shareLink} style={{
                            flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                            background: accent, color: '#fff',
                          }}>공유하기</button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* 파트너 멤버가 없을 때 (가족 설정에서 이름 안 넣은 경우) */}
          {members.filter(m => m.role !== 'owner').length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
              파트너를 초대하면 식단과 장보기 목록을 함께 관리할 수 있어요.{' '}
              <button onClick={() => setEditOpen(true)} style={{ color: accent, fontWeight: 700, fontSize: 13 }}>
                가족 설정에서 파트너 이름을 추가해 주세요.
              </button>
            </div>
          )}
        </div>
      )}

      {/* 장보는 요일 */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', padding: 16, marginBottom: 14 }}>
        <div className="kr-en" style={{ marginBottom: 4 }}>SHOPPING DAY · 장보는 요일</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>
          {family.shopping_day_kr}요일
        </div>
        <div style={{ marginTop: 8, height: 6, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.round(((family.shopping_day + 1) / 7) * 100)}%`,
            background: 'linear-gradient(90deg, var(--baby) 0%, #B8C58A 60%, var(--warn) 100%)',
            borderRadius: 999,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>
          <span>월요일 기준 {family.shopping_day_kr}요일 장보기</span>
        </div>
      </div>

      {/* 강조색 */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', padding: 16, marginBottom: 14 }}>
        <div className="kr-en" style={{ marginBottom: 12 }}>ACCENT COLOR · 강조색</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {PRESET_ACCENTS.map(p => (
            <button key={p.value} onClick={() => {
              setAccent(p.value);
              document.documentElement.style.setProperty('--accent', p.value);
            }} style={{
              aspectRatio: '1', borderRadius: 12, background: p.value,
              border: accent === p.value ? '3px solid var(--ink)' : '3px solid transparent',
              outline: accent === p.value ? `2px solid ${p.value}` : 'none',
              outlineOffset: 2,
            }} title={p.name} />
          ))}
        </div>
      </div>

      {/* 회원 탈퇴 */}
      <div style={{ padding: '4px 0 8px' }}>
        <button
          onClick={() => setDeleteOpen(true)}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12,
            border: '1px solid var(--line)', background: 'transparent',
            fontSize: 13, fontWeight: 600, color: 'var(--ink-4)',
          }}
        >
          회원 탈퇴
        </button>
      </div>

      <FamilyEditSheet
        open={editOpen}
        profile={profile}
        accent={accent}
        onSave={handleSaveProfile}
        onClose={() => setEditOpen(false)}
      />

      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
