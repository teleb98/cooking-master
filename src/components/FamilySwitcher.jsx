/*
 * rarebook 패밀리 스위처 — 세 서비스(서점 · 독서 서재 · 쿠킹마스터) 공통 크로스 내비게이션.
 * www / pkl 과 동일한 콘텐츠·디자인(웜 종이·책 톤). current='cooking' 로 현재 서비스 표시.
 */
export const RAREBOOK_SERVICES = [
  { id: 'www',     emoji: '📚', name: '서점',       desc: '희귀 도서 스토어',    url: 'https://www.rarebook.co.kr' },
  { id: 'pkl',     emoji: '📖', name: '독서 서재',   desc: 'AI 독서 · 지식 관리',  url: 'https://pkl.rarebook.co.kr' },
  { id: 'cooking', emoji: '🍳', name: '쿠킹마스터',  desc: 'AI 식단 · 장보기',     url: 'https://cooking.rarebook.co.kr' },
];

export default function FamilySwitcher({ current = 'cooking', compact = false }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--ink-4)',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8,
        padding: compact ? '0 4px' : 0,
      }}>
        rarebook 서비스
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {RAREBOOK_SERVICES.map(s => {
          const active = s.id === current;
          return (
            <a
              key={s.id}
              href={active ? undefined : s.url}
              onClick={active ? (e) => e.preventDefault() : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 13px', borderRadius: 12,
                textDecoration: 'none',
                background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                cursor: active ? 'default' : 'pointer',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>{s.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{s.desc}</span>
              </span>
              {active && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>현재</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}
