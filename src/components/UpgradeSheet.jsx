import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { useBackHandler } from '../hooks/useBackHandler';
import Icon from '../icons';

const PLAN_LIMITS = { free: { generate: 1, chat: 5 }, premium: { generate: 4, chat: 30 } };

const FEATURES = [
  { label: 'AI 식단 생성',     free: '월 1회',   premium: '월 4회',  admin: '무제한' },
  { label: 'AI 채팅',          free: '월 5턴',   premium: '월 30턴', admin: '무제한' },
  { label: '커스텀 레시피',    free: '최대 5개', premium: '무제한',  admin: '무제한' },
  { label: '맞춤 식단 추천',   free: true,        premium: true,       admin: true },
  { label: '장보기 목록',      free: true,        premium: true,       admin: true },
  { label: '파트너 공유',      free: true,        premium: true,       admin: true },
];

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
  return res.json();
}

export default function UpgradeSheet() {
  const { accent, upgradeOpen, setUpgradeOpen, upgradeInfo, showToast } = useApp();
  const { planInfo } = useFamily();
  const [loading, setLoading] = useState(false);
  useBackHandler(upgradeOpen, () => setUpgradeOpen(false));

  const type      = upgradeInfo?.type ?? 'generate';
  const planType  = planInfo?.plan_type ?? 'free';
  const isPremium = planType === 'premium';
  const isAdmin   = planType === 'admin' || planInfo?.is_admin;
  const isTest    = planType === 'test'  || planInfo?.is_test;
  const used      = upgradeInfo?.used  ?? 0;
  const limit     = upgradeInfo?.limit ?? PLAN_LIMITS[isPremium ? 'premium' : 'free'][type];
  const typeLabel = type === 'generate' ? 'AI 식단 생성' : 'AI 채팅';

  const clientKey     = planInfo?.toss_client_key ?? '';
  const customerKey   = planInfo?.billing_customer_key ?? '';
  const appUrl        = window.location.origin;

  const handleSubscribe = async () => {
    if (!clientKey) {
      showToast('결제 서비스가 준비 중입니다.', 'error');
      return;
    }
    if (!window.TossPayments) {
      showToast('결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    try {
      setLoading(true);
      const tossPayments = window.TossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });
      await payment.requestBillingAuth({
        method:     'CARD',
        successUrl: `${appUrl}/profile?billing=success`,
        failUrl:    `${appUrl}/profile?billing=fail`,
      });
      // requestBillingAuth redirects the browser — code below won't run
    } catch (err) {
      console.error('[billing]', err);
      showToast(err.message || '결제 중 오류가 발생했습니다.', 'error');
      setLoading(false);
    }
  };

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
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {isAdmin ? '관리자 플랜' : isTest ? '테스트 플랜' : '플랜 안내'}
            </div>
            <div className="kr-en" style={{ marginTop: 2 }}>
              {isAdmin ? 'Admin — Unlimited' : isTest ? 'Test — Unlimited' : 'Plan & Usage'}
            </div>
          </div>
          <button onClick={() => setUpgradeOpen(false)} style={{ color: 'var(--ink-3)', padding: 4 }}>
            {Icon.close(20)}
          </button>
        </div>
        <div style={{ height: 1, background: 'var(--line-soft)' }} />

        <div style={{ padding: '18px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 관리자/테스트 배너 */}
          {(isAdmin || isTest) && (
            <div style={{
              padding: '12px 16px', borderRadius: 14,
              background: isAdmin ? '#1a1a2e' : '#0d2137',
              border: `1px solid ${isAdmin ? '#4A4AFF44' : '#00BFFF44'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 20 }}>{isAdmin ? '👑' : '🧪'}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: isAdmin ? '#8888FF' : '#00BFFF' }}>
                  {isAdmin ? '관리자 계정' : '테스트 계정'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  모든 기능을 무제한으로 사용할 수 있습니다
                </div>
              </div>
            </div>
          )}

          {/* 사용량 현황 (일반 사용자만) */}
          {!isAdmin && !isTest && (
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
              <div style={{ marginTop: 8, height: 6, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (used / limit) * 100)}%`,
                  background: used >= limit ? '#C0392B' : accent,
                  borderRadius: 999, transition: 'width 400ms',
                }} />
              </div>
            </div>
          )}

          {/* 플랜 비교 */}
          <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--bg)' }}>
              <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }} />
              <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Free</div>
              <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 800, color: accent }}>Premium</div>
            </div>
            <div style={{ height: 1, background: 'var(--line-soft)' }} />
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

          {/* 가격 카드 */}
          {!isPremium && !isAdmin && !isTest && (
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
          )}

          {/* CTA 버튼 */}
          {isAdmin || isTest ? (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>
              {isAdmin ? '👑 관리자 계정은 모든 기능이 무료입니다.' : '🧪 테스트 계정 — 프리미엄 기능 사용 가능'}
            </div>
          ) : isPremium ? (
            <div style={{
              padding: '12px 16px', borderRadius: 14,
              background: `${accent}10`, border: `1px solid ${accent}33`,
              textAlign: 'center', fontSize: 13, color: accent, fontWeight: 600,
            }}>
              ✓ 현재 Premium 플랜 사용 중
            </div>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={loading}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 14,
                background: loading ? 'var(--ink-4)' : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                color: '#fff', fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 200ms',
              }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                  결제 페이지로 이동 중...
                </>
              ) : (
                <>{Icon.spark(16)} Premium 구독하기 — 월 2,900원</>
              )}
            </button>
          )}

          {!isPremium && !isAdmin && !isTest && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.6 }}>
              카드 등록 후 즉시 결제됩니다. 언제든지 해지할 수 있으며,<br/>
              해지 시 이번 달 만료일까지 계속 이용 가능합니다.
            </div>
          )}
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
