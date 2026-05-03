import { useNavigate } from 'react-router-dom';
import Icon from '../icons';

const FEATURES = [
  {
    icon: s => Icon.calendar(s),
    color: '#C8654A',
    bg: '#F1D9CF',
    kr: '2주 식단 한눈에',
    en: 'Meal calendar',
    desc: '아침·점심·저녁 3끼를 2주치로 계획하고 칼로리를 자동 집계합니다.',
  },
  {
    icon: s => Icon.spark(s),
    color: '#3F4D8A',
    bg: '#DDE1F4',
    kr: 'AI가 메뉴를 바꿔줘요',
    en: 'AI meal swap',
    desc: '자연어로 요청하면 AI가 대안 메뉴를 추천하고 장바구니까지 업데이트합니다.',
  },
  {
    icon: s => Icon.baby(s),
    color: '#6F8E5A',
    bg: '#DEE7CD',
    kr: '이유식 자동 분기',
    en: 'Baby branch',
    desc: '아기 개월 수에 맞는 이유식 단계를 자동으로 계산해 식단에 분기합니다.',
  },
  {
    icon: s => Icon.cart(s),
    color: '#C9943C',
    bg: '#F4E4C2',
    kr: '장보기 목록 자동 생성',
    en: 'Smart grocery',
    desc: '식단에서 재료를 자동 합산하고, 장 보는 요일에 맞춰 신선도 순으로 정렬합니다.',
  },
];

export default function WelcomeScreen() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* Hero */}
      <div style={{
        padding: '52px 28px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* App icon */}
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: 'var(--accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 32px rgba(200,101,74,0.35)',
          marginBottom: 24,
        }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l1-5h16l1 5"/>
            <path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2z"/>
            <path d="M8 19v2M16 19v2"/>
            <path d="M9 3c0-1 1-2 2-2s2 1 2 2-1 2-2 2"/>
          </svg>
        </div>

        <div style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 600, color: 'var(--ink-3)', marginBottom: 10 }}>
          COOKING MASTER
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 800, color: 'var(--ink)',
          margin: 0, lineHeight: 1.2, letterSpacing: '-0.02em',
        }}>
          온 가족의 식단을<br />스마트하게
        </h1>
        <p style={{
          fontSize: 14, color: 'var(--ink-3)', marginTop: 14,
          lineHeight: 1.65, maxWidth: 280,
        }}>
          2주 식단 계획부터 AI 메뉴 추천,
          이유식 분기, 장보기 목록까지
          한 앱에서 관리하세요.
        </p>
      </div>

      {/* Feature cards */}
      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FEATURES.map(f => (
          <div key={f.kr} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'var(--surface)', borderRadius: 16,
            border: '1px solid var(--line)', padding: '14px 16px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: f.bg, color: f.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {f.icon(22)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{f.kr}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>{f.en}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: '24px 20px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={() => navigate('/login')}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 16,
            background: 'var(--accent)', color: '#fff',
            fontSize: 15, fontWeight: 700,
            boxShadow: '0 8px 24px rgba(200,101,74,0.35)',
          }}
        >
          시작하기 · Get started
        </button>
        <button
          onClick={() => navigate('/login')}
          style={{
            width: '100%', padding: '12px 0',
            background: 'none', color: 'var(--ink-3)',
            fontSize: 13, fontWeight: 500,
          }}
        >
          이미 계정이 있어요 · Sign in
        </button>
      </div>
    </div>
  );
}
