import { useApp } from '../context/AppContext';
import { useBackHandler } from '../hooks/useBackHandler';
import Icon from '../icons';

const PLAN_LIMITS = { free: { generate: 1, chat: 5 }, premium: { generate: 4, chat: 30 } };

const FEATURES = [
  { label: 'AI 식단 생성',   free: '월 1회',   premium: '월 4회' },
  { label: 'AI 채팅',        free: '월 5턴',   premium: '월 30턴' },
  { label: '맞춤 식단 추천', free: true,        premium: true },
  { label: '장보기 목록',    free: true,        premium: true },
  { label: '파트너 공유',    free: true,        premium: true },
];

export default function UpgradeSheet() {
  const { accent, upgradeOpen, setUpgradeOpen, upgradeInfo } = useApp();
  useBackHandler(upgradeOpen, () => setUpgradeOpen(false));

  const type = upgradeInfo?.type ?? 'generate';
  const isPremium = upgradeInfo?.isPremium ?? false;
  const used  = upgradeInfo?.used  ?? 0;
  const limit = upgradeInfo?.limit ?? PLAN_LIMITS[isPremium ? 'premium' : 'free'][type];

  const typeLabel = type === 'generate' ? 'AI 식단 생성' : 'AI 채팅';

  return (
    <div
      onClick={() => setUpgradeOpen(false)}
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: upgradeOpen ? 'auto' : 'none',
        background: upgradeOpen ? 'rgba(20,16,12,0.45)' : 'transparent',
        transition: 'background 240ms ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          transform: upgradeOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: '0 -8px 30px rgba(20,16,12,0.18)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* drag handle */}
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line)' }} />
        </div>

        {/* header */}
        <div style={{ padding: '4px 18px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>플랜 안내</div>
            <div className="kr-en" style={{ marginTop: 2 }}>Plan & Usage</div>
          </div>
          <button onClick={() => setUpgradeOpen(false)} style={{ color: 'var(--ink-3)', padding: 4 }}>
            {Icon.close(20)}
          </button>
        </div>
        <div style={{ height: 1, background: 'var(--line-soft)' }} />

        <div style={{ padding: '18px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 사용량 현황 */}
          <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              이번 달 사용 현황
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{typeLabel}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: used >= limit ? '#C0392B' : accent }}>
                {used} / {limit}회 {used >= limit ? '(소진)' : ''}
              </span>
            </div>
            {/* progress bar */}
            <div style={{ marginTop: 8, height: 6, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (used / limit) * 100)}%`,
                background: used >= limit ? '#C0392B' : accent,
                borderRadius: 999,
                transition: 'width 400ms',
              }} />
            </div>
          </div>

          {/* 플랜 비교 */}
          <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
            {/* 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--bg)' }}>
              <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }} />
              <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Free</div>
              <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 800, color: accent }}>Premium</div>
            </div>
            <div style={{ height: 1, background: 'var(--line-soft)' }} />
            {/* 행 */}
            {FEATURES.map((f, i) => (
              <div key={f.label} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)',
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
              }}>
                <div style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500 }}>{f.label}</div>
                <div style={{ padding: '11px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                  {typeof f.free === 'boolean' ? (f.free ? checkIcon(accent) : '—') : f.free}
                </div>
                <div style={{ padding: '11px 0', textAlign: 'center', fontSize: 12, color: accent, fontWeight: 600 }}>
                  {typeof f.premium === 'boolean' ? (f.premium ? checkIcon(accent) : '—') : f.premium}
                </div>
              </div>
            ))}
          </div>

          {/* 가격 */}
          <div style={{
            padding: '14px 16px', borderRadius: 14,
            background: `${accent}12`, border: `1px solid ${accent}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: accent }}>Premium</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>월 구독 · 언제든 해지 가능</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>2,900원</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>/ 월</div>
            </div>
          </div>

          {/* CTA */}
          <button
            disabled
            style={{
              width: '100%', padding: '15px 0', borderRadius: 14,
              background: 'var(--ink-4)', color: '#fff',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {Icon.spark(16)}
            출시 예정 — 곧 만나요!
          </button>

          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>
            현재 베타 기간입니다. 프리미엄 결제 기능은 곧 추가될 예정이에요.
          </div>
        </div>
      </div>
    </div>
  );
}

function checkIcon(color) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
