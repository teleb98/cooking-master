import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { Sheet } from '../components/Sheet';
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';

const QUICK_REPLIES = ['이번 주 다시 추천해줘', '고기 요리 줄여줘', '아기 이유식 추천해줘', '재료 적은 메뉴로'];

const MEAL_KR = { breakfast: '아침', lunch: '점심', dinner: '저녁' };
const DAY_KR  = ['일', '월', '화', '수', '목', '금', '토'];

/* ── 개별 변경 선택 컴포넌트 ─────────────────────────────────── */
function ChangeSelector({ changes, accent, onApply, onGoGrocery }) {
  const [selected, setSelected] = useState(() => new Set(changes.map((_, i) => i)));
  const [applying, setApplying] = useState(false);
  const [applied, setApplied]   = useState(false);

  const toggle = (i) => {
    if (applied) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleApply = async () => {
    const toApply = changes.filter((_, i) => selected.has(i));
    if (!toApply.length || applying) return;
    setApplying(true);
    const ok = await onApply(toApply);
    setApplied(ok > 0);
    setApplying(false);
  };

  const selectedCount = selected.size;

  return (
    <div style={{
      border: `1px solid ${applied ? 'var(--line)' : accent}`,
      borderRadius: 12, overflow: 'hidden',
      opacity: applied ? 0.65 : 1,
      transition: 'opacity 300ms',
    }}>
      {changes.map((c, i) => {
        const d = new Date(c.plan_date); // UTC midnight (date-only string)
        const dayKr = DAY_KR[d.getUTCDay()];
        const isChecked = selected.has(i);
        return (
          <div
            key={i}
            onClick={() => toggle(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 12px',
              borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)',
              background: isChecked && !applied ? `${accent}0D` : 'var(--surface)',
              cursor: applied ? 'default' : 'pointer',
              transition: 'background 120ms',
            }}
          >
            {/* 체크박스 */}
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              background: applied ? 'var(--baby)' : isChecked ? accent : 'transparent',
              border: applied || isChecked ? 'none' : '1.5px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 120ms',
            }}>
              {(isChecked || applied) && Icon.check(11)}
            </div>

            {/* 내용 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 1 }}>
                {c.plan_date.slice(5).replace('-', '/')} ({dayKr}) · {MEAL_KR[c.meal_type] ?? c.meal_type}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.menu_name}
              </div>
            </div>
          </div>
        );
      })}

      {/* 적용 버튼 */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line-soft)', background: 'var(--bg)' }}>
        {applied ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0' }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ color: 'var(--baby)' }}>{Icon.check(13)}</span>
              캘린더에 반영되었어요
            </div>
            <button
              onClick={onGoGrocery}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 8,
                border: '1px solid var(--line)', background: 'var(--surface)',
                fontSize: 12, fontWeight: 600, color: 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {Icon.cart(13)} 장보기 목록 업데이트하기
            </button>
          </div>
        ) : (
          <button
            onClick={handleApply}
            disabled={selectedCount === 0 || applying}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 9,
              background: selectedCount > 0 ? accent : 'var(--ink-4)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background 150ms',
            }}
          >
            {applying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                </path>
              </svg>
            ) : Icon.check(13)}
            {applying ? '적용 중…' : `선택한 메뉴 적용 (${selectedCount}/${changes.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── 메시지 버블 ──────────────────────────────────────────────── */
function MessageBubble({ m, accent, onApply, onGoGrocery }) {
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

  const displayText = m.text.replace(/```json[\s\S]*?```/g, '').trim();

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: 'var(--bg-2)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {displayText || (m.streaming ? '...' : '')}
      </div>
      {m.changes?.length > 0 && (
        <ChangeSelector changes={m.changes} accent={accent} onApply={onApply} onGoGrocery={onGoGrocery} />
      )}
    </div>
  );
}

const hasSpeech = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/* ── 메인 컴포넌트 ────────────────────────────────────────────── */
export default function ChatSheet() {
  const { chatOpen, setChatOpen, accent, bumpMealVersion, markLocalMealChange, showToast, showUpgrade } = useApp();
  const { family } = useFamily();
  const navigate = useNavigate();
  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending]   = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef      = useRef(null);
  const historyRef     = useRef([]);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (chatOpen) {
      const greeting = `안녕하세요 ${family.name}! 이번 주 식단 어떻게 도와드릴까요?`;
      setMessages([{ from: 'ai', kind: 'text', text: greeting }]);
      historyRef.current = [{ from: 'ai', text: greeting }];
      setInput('');
    } else {
      recognitionRef.current?.abort();
      setListening(false);
    }
  }, [chatOpen, family.name]);

  const toggleListen = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [listening]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 선택한 변경만 적용 — ChangeSelector에서 호출, 성공 건수 반환
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
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    if (ok > 0) {
      changes.forEach(c => markLocalMealChange(`${c.plan_date}_${c.meal_type}`));
      bumpMealVersion();
      showToast(`${ok}개 식단이 캘린더에 반영됐어요`, 'success');
    }
    return ok;
  };

  const send = async (text) => {
    if (!text?.trim() || sending) return;
    setSending(true);
    setInput('');

    setMessages(prev => [...prev,
      { from: 'user', kind: 'text', text },
      { from: 'ai',  kind: 'thinking' },
    ]);
    const history = historyRef.current.slice(-8);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw Object.assign(new Error(errData.error ?? `HTTP ${res.status}`), { status: res.status });
      }
      const data = await res.json();

      setMessages(prev => prev.filter(m => m.kind !== 'thinking').concat([
        { from: 'ai', kind: 'text', text: data.text, changes: data.changes },
      ]));
      historyRef.current = [...historyRef.current, { from: 'user', text }, { from: 'ai', text: data.text }];
    } catch (err) {
      const status = err.status ?? 0;
      if (status === 402) {
        showUpgrade({ type: 'chat', isPremium: false, used: 5, limit: 5 });
        setMessages(prev => prev.filter(m => m.kind !== 'thinking').concat([
          { from: 'ai', kind: 'text', text: '이번 달 AI 채팅 횟수를 모두 사용했습니다. 프리미엄 플랜에서 월 30턴을 이용할 수 있어요.' },
        ]));
      } else {
        const msg = status === 429
          ? 'AI 요청이 너무 많습니다. 1분 후 다시 시도해주세요.'
          : status === 503
          ? 'AI 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.'
          : err.message || '죄송해요, 일시적인 오류입니다. 잠시 후 다시 시도해주세요.';
        setMessages(prev => prev.filter(m => m.kind !== 'thinking').concat([
          { from: 'ai', kind: 'text', text: msg },
        ]));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Cooking Master AI" subtitle="자연어로 식단을 바꾸세요">
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <MessageBubble key={m.id ?? i} m={m} accent={accent} onApply={applyChanges} onGoGrocery={() => { setChatOpen(false); navigate('/grocery'); }} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 빠른 답변 */}
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

      {/* 입력창 */}
      <div style={{ borderTop: '1px solid var(--line)', padding: '10px 10px 14px', display: 'flex', gap: 6, alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
          background: 'var(--bg)',
          border: `1px solid ${listening ? accent : 'var(--line)'}`,
          borderRadius: 999, padding: '10px 14px',
          transition: 'border-color 200ms',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !sending) send(input); }}
            placeholder={listening ? '듣고 있어요…' : '메시지 입력 · message'}
            disabled={sending}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
          />
          {listening && (
            <span style={{ display: 'flex', gap: 3, alignItems: 'center', marginLeft: 8 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 3, height: 3, borderRadius: '50%', background: accent,
                  animation: `bounce 1s ${i * 0.15}s ease-in-out infinite`,
                }} />
              ))}
            </span>
          )}
        </div>
        {hasSpeech && (
          <button
            onClick={toggleListen}
            disabled={sending}
            style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: listening ? accent : 'var(--surface)',
              border: listening ? 'none' : '1px solid var(--line)',
              color: listening ? '#fff' : 'var(--ink-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: listening ? `0 4px 14px ${accent}66` : 'none',
              transition: 'background 200ms, box-shadow 200ms',
            }}
          >
            {Icon.mic(18)}
          </button>
        )}
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: sending || !input.trim() ? 'var(--ink-4)' : accent,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: sending || !input.trim() ? 'none' : `0 4px 12px ${accent}4D`,
            flexShrink: 0, transition: 'background 150ms',
          }}
        >{Icon.send(18)}</button>
      </div>
    </Sheet>
  );
}
