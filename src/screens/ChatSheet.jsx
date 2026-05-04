import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { Sheet } from '../components/Sheet';
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';

const QUICK_REPLIES = ['이번 주 다시 추천해줘', '고기 요리 줄여줘', '아기 이유식 추천해줘', '재료 적은 메뉴로'];

function MessageBubble({ m, accent, onApply }) {
  if (m.kind === 'thinking') {
    return (
      <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 14 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-3)', animation: `bounce 1.2s ${i * 0.15}s infinite` }} />
        ))}
      </div>
    );
  }

  if (m.from === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '80%', background: accent, color: '#fff', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: 13.5, lineHeight: 1.45 }}>
        {m.text}
      </div>
    );
  }

  // AI message — strip JSON code block for display
  const displayText = m.text.replace(/```json[\s\S]*?```/g, '').trim();

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: 'var(--bg-2)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {displayText || (m.streaming ? '...' : '')}
      </div>
      {m.changes?.length > 0 && (
        <button onClick={() => onApply(m.changes)} style={{
          alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 10,
          background: accent, color: '#fff', fontSize: 13, fontWeight: 700,
          boxShadow: `0 4px 12px ${accent}4D`,
        }}>
          {Icon.check(13)} 식단에 적용하기 ({m.changes.length}건)
        </button>
      )}
    </div>
  );
}

export default function ChatSheet() {
  const { chatOpen, setChatOpen, accent } = useApp();
  const { family } = useFamily();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const historyRef = useRef([]); // track non-streaming history for API

  useEffect(() => {
    if (chatOpen) {
      const greeting = `안녕하세요 ${family.name}! 이번 주 식단 어떻게 도와드릴까요?`;
      const init = [{ from: 'ai', kind: 'text', text: greeting }];
      setMessages(init);
      historyRef.current = [{ from: 'ai', text: greeting }];
      setInput('');
    }
  }, [chatOpen, family.name]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const applyChanges = async (changes) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const results = await Promise.allSettled(
      changes.map(c =>
        fetch('/api/meals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(c),
        })
      )
    );
    const ok = results.filter(r => r.status === 'fulfilled').length;
    setMessages(prev => [...prev, {
      from: 'ai', kind: 'text',
      text: `✅ ${ok}개 식단을 업데이트했어요! 캘린더를 새로고침하면 반영됩니다.`,
    }]);
  };

  const send = async (text) => {
    if (!text?.trim() || sending) return;
    setSending(true);
    setInput('');

    setMessages(prev => [...prev, { from: 'user', kind: 'text', text }, { from: 'ai', kind: 'thinking' }]);
    const history = historyRef.current.slice(-8);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setMessages(prev => prev.filter(m => m.kind !== 'thinking').concat([
        { from: 'ai', kind: 'text', text: data.text, changes: data.changes },
      ]));
      historyRef.current = [...historyRef.current, { from: 'user', text }, { from: 'ai', text: data.text }];
    } catch (err) {
      const msg = err.message.includes('402')
        ? 'AI 서비스 크레딧이 부족합니다. 잠시 후 다시 시도해주세요.'
        : '죄송해요, 일시적인 오류입니다. 잠시 후 다시 시도해주세요.';
      setMessages(prev => prev.filter(m => m.kind !== 'thinking').concat([
        { from: 'ai', kind: 'text', text: msg },
      ]));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Cooking Master AI" subtitle="자연어로 식단을 바꾸세요">
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => <MessageBubble key={m.id ?? i} m={m} accent={accent} onApply={applyChanges} />)}
        <div ref={bottomRef} />
      </div>

      <div className="no-scrollbar" style={{ padding: '4px 16px 6px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {QUICK_REPLIES.map(q => (
          <button key={q} onClick={() => send(q)} disabled={sending} style={{
            flex: 'none', padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line)',
            background: 'var(--bg)', color: sending ? 'var(--ink-4)' : 'var(--ink-2)',
            fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            <span style={{ color: accent }}>{Icon.spark(11)}</span>{q}
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px 14px', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, padding: '10px 16px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !sending) send(input); }}
            placeholder="메시지 입력 · message"
            disabled={sending}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
          />
        </div>
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: sending || !input.trim() ? 'var(--ink-4)' : accent,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: sending ? 'none' : `0 4px 12px ${accent}4D`,
            flexShrink: 0, transition: 'background 150ms',
          }}
        >{Icon.send(18)}</button>
      </div>
    </Sheet>
  );
}
