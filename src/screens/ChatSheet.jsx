import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Sheet } from '../components/Sheet';
import Icon from '../icons';

function DiffCol({ label, labelEn, name, sub, muted, highlight }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label} · {labelEn}
      </div>
      <div style={{
        marginTop: 4, padding: 10, borderRadius: 10,
        background: highlight ? '#FBEFEA' : 'var(--bg)',
        border: highlight ? `1px solid ${highlight}` : '1px solid var(--line)',
        color: muted ? 'var(--ink-3)' : 'var(--ink)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function PreviewCard({ accent }) {
  return (
    <div style={{ alignSelf: 'stretch', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          <span style={{ color: accent }}>{Icon.spark(13)}</span> 변경 미리보기 · Preview change
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>5/8 (FRI) · 저녁</span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DiffCol label="변경 전" labelEn="Before" name="—" sub="비어있음" muted />
          <div style={{ color: 'var(--ink-4)' }}>→</div>
          <DiffCol label="변경 후" labelEn="After" name="스테이크" sub="소고기 400g · 580 kcal" highlight={accent} />
        </div>
        <div style={{ background: 'var(--baby-soft)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--baby-ink)', fontSize: 12 }}>
          {Icon.baby(14)}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>이유식 분기 자동 생성</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>소고기 30g 으깨기 · 8M 중기</div>
          </div>
        </div>
        <div style={{ background: 'var(--warn-soft)', border: '1px solid #E8D196', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, color: '#7A5A1B', fontSize: 12 }}>
          <span style={{ color: 'var(--warn)' }}>{Icon.warn(14)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>소고기 합산 700g</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>목요일 미역국과 자동 합산됩니다</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button style={{ flex: 1, padding: '11px 0', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}>취소</button>
          <button style={{ flex: 1.4, padding: '11px 0', borderRadius: 10, background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 600 }}>확정 · Confirm</button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m, accent }) {
  if (m.kind === 'thinking') {
    return (
      <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 14 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-3)', animation: `bounce 1.2s ${i * 0.15}s infinite` }} />
        ))}
      </div>
    );
  }
  if (m.kind === 'preview') return <PreviewCard accent={accent} />;
  if (m.from === 'user') {
    return (
      <div style={{
        alignSelf: 'flex-end', maxWidth: '80%',
        background: accent, color: '#fff',
        padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
        fontSize: 13.5, lineHeight: 1.45,
      }}>
        {m.text}
      </div>
    );
  }
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
      <div style={{
        background: 'var(--bg-2)', padding: '10px 14px',
        borderRadius: '16px 16px 16px 4px', color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.45,
      }}>{m.text}</div>
      {m.sub && <div className="kr-en" style={{ marginTop: 4, marginLeft: 4 }}>{m.sub}</div>}
    </div>
  );
}

const INITIAL_MESSAGES = [
  { from: 'ai', kind: 'text', text: '안녕하세요 서연님. 이번 주 식단 어떻게 도와드릴까요?', sub: "Hi Seoyeon, how can I help with this week's plan?" },
];

const QUICK_REPLIES = ['이번 주 다시 추천', '금요일 저녁 바꿔줘', '냉장고 재료로'];

export default function ChatSheet() {
  const { chatOpen, setChatOpen, accent } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (chatOpen) setMessages(INITIAL_MESSAGES);
  }, [chatOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (text) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { from: 'user', kind: 'text', text }]);
    setInput('');
    setTimeout(() => {
      setMessages(m => [...m, { from: 'ai', kind: 'thinking' }]);
      setTimeout(() => {
        setMessages(m => m.filter(x => x.kind !== 'thinking').concat([
          { from: 'ai', kind: 'text', text: '금요일 저녁을 스테이크로 변경하고, 하준이 이유식도 같이 분기할게요. 미리보기 확인해주세요.', sub: 'Switching Fri dinner to steak with baby branch. Preview below.' },
          { from: 'ai', kind: 'preview' },
        ]));
      }, 900);
    }, 250);
  };

  return (
    <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Cooking Master AI" subtitle="자연어로 식단을 바꾸세요">
      {/* Messages */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => <MessageBubble key={i} m={m} accent={accent} />)}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div className="no-scrollbar" style={{ padding: '4px 16px 6px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {QUICK_REPLIES.map(q => (
          <button key={q} onClick={() => send(q)} style={{
            flex: 'none', padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line)',
            background: 'var(--bg)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            <span style={{ color: accent }}>{Icon.spark(11)}</span>{q}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div style={{
        borderTop: '1px solid var(--line)', padding: '10px 14px 14px',
        display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)',
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          background: 'var(--bg)', border: '1px solid var(--line)',
          borderRadius: 999, padding: '10px 16px',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(input); }}
            placeholder="메시지 입력 · message"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
          />
        </div>
        <button onClick={() => send(input)} style={{
          width: 44, height: 44, borderRadius: '50%', background: accent, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 12px ${accent}4D`,
          flexShrink: 0,
        }}>{Icon.send(18)}</button>
      </div>
    </Sheet>
  );
}
