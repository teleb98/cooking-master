import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../context/FamilyContext';
import Icon from '../icons';

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

export default function ProfileScreen() {
  const { accent, setAccent } = useApp();
  const { user, logout } = useAuth();
  const { family } = useFamily();
  const navigate = useNavigate();

  const provider = user?.provider ? PROVIDER_LABEL[user.provider] : null;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Build member list from real data
  const members = [];
  if (user?.name) members.push({ name: user.name, role: 'owner', colorIdx: 0 });
  if (family.partner_name) members.push({ name: family.partner_name, role: 'partner', colorIdx: 1 });

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

        {members.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {members.map((m, i) => (
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

        {/* 타입 뱃지 */}
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

        <button onClick={() => navigate('/onboarding')} style={{
          marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 10,
          border: '1px solid var(--line)', background: 'var(--bg)',
          fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
        }}>
          패밀리 설정 수정
        </button>
      </div>

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
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', padding: 16 }}>
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
    </div>
  );
}
