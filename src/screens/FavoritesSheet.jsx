import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp }    from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { Sheet }     from '../components/Sheet';
import Icon          from '../icons';

const TOKEN_KEY = 'cookingMaster_token';
const hasSpeech = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

function resizeToBase64(file, maxPx = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default function FavoritesSheet() {
  const { favoritesOpen, setFavoritesOpen, favoriteSeed, setFavoriteSeed, accent, showToast } = useApp();
  const { family, saveProfile } = useFamily();

  const [input, setInput]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [listening, setListening]   = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const recognitionRef = useRef(null);
  const fileRef        = useRef(null);

  const likes = family.food_likes ?? [];

  useEffect(() => {
    if (favoritesOpen) {
      if (favoriteSeed) {
        setInput(favoriteSeed);
        setFavoriteSeed(null);
      }
    } else {
      setInput('');
      recognitionRef.current?.abort();
      setListening(false);
    }
  }, [favoritesOpen]); // eslint-disable-line

  const addItem = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (likes.includes(trimmed)) {
      showToast('이미 추가된 메뉴예요', 'info');
      return;
    }
    setSaving(true);
    await saveProfile({ food_likes: [...likes, trimmed] });
    setSaving(false);
    setInput('');
    showToast(`"${trimmed}" 추가됐어요`, 'success');
  }, [likes, saveProfile, showToast]);

  const removeItem = useCallback(async (name) => {
    await saveProfile({ food_likes: likes.filter(l => l !== name) });
  }, [likes, saveProfile]);

  const toggleListen = useCallback(() => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart  = () => setListening(true);
    rec.onresult = (e) => setInput(Array.from(e.results).map(r => r[0].transcript).join(''));
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [listening]);

  const handlePhoto = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdentifying(true);
    try {
      const base64 = await resizeToBase64(file);
      if (!base64) throw new Error('이미지 변환 실패');
      const token = localStorage.getItem(TOKEN_KEY);
      const res   = await fetch('/api/ai/identify-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_base64: base64, mime_type: 'image/jpeg' }),
      });
      const data = await res.json();
      if (data.name) {
        setInput(data.name);
      } else {
        showToast('음식을 인식하지 못했어요', 'error');
      }
    } catch {
      showToast('사진 처리 중 오류가 발생했어요', 'error');
    } finally {
      setIdentifying(false);
      e.target.value = '';
    }
  }, [showToast]);

  return (
    <Sheet
      open={favoritesOpen}
      onClose={() => setFavoritesOpen(false)}
      title="좋아하는 메뉴"
      subtitle="AI 식단 생성·채팅에 반영됩니다"
    >
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 8px' }}>

        {/* ── 즐겨찾기 목록 ─────────────────────────── */}
        {likes.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            아직 추가된 메뉴가 없어요
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 0' }}>
            {likes.map(name => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px 7px 14px', borderRadius: 999,
                background: `${accent}18`, border: `1px solid ${accent}44`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
                <button
                  onClick={() => removeItem(name)}
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-4)', padding: 2 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {likes.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', paddingBottom: 16, lineHeight: 1.5 }}>
            {likes.length}개 메뉴 · AI가 식단 생성 시 이 메뉴를 더 자주 배치합니다
          </div>
        )}
      </div>

      {/* ── 입력 영역 ─────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px 16px', background: 'var(--surface)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.04em', marginBottom: 8 }}>
          새 메뉴 추가
        </div>

        {/* 입력창 + 버튼들 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
              onKeyDown={e => { if (e.key === 'Enter' && !saving) addItem(input); }}
              placeholder={identifying ? 'AI가 인식 중...' : listening ? '듣고 있어요…' : '메뉴 이름 입력'}
              disabled={identifying}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
            />
            {(listening || identifying) && (
              <span style={{ display: 'flex', gap: 3, alignItems: 'center', marginLeft: 8 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 3, height: 3, borderRadius: '50%',
                    background: identifying ? '#F59E0B' : accent,
                    animation: `bounce 1s ${i * 0.15}s ease-in-out infinite`,
                  }} />
                ))}
              </span>
            )}
          </div>

          {/* 음성 버튼 */}
          {hasSpeech && (
            <button
              onClick={toggleListen}
              disabled={identifying}
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: listening ? accent : 'var(--surface)',
                border: listening ? 'none' : '1px solid var(--line)',
                color: listening ? '#fff' : 'var(--ink-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: listening ? `0 4px 12px ${accent}55` : 'none',
                transition: 'background 200ms',
              }}
            >
              {Icon.mic(16)}
            </button>
          )}

          {/* 사진 버튼 */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={identifying}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: identifying ? accent : 'var(--surface)',
              border: identifying ? 'none' : '1px solid var(--line)',
              color: identifying ? '#fff' : 'var(--ink-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 200ms',
            }}
          >
            {identifying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                </path>
              </svg>
            ) : Icon.camera(16)}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} />

          {/* 추가 버튼 */}
          <button
            onClick={() => addItem(input)}
            disabled={!input.trim() || saving}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: !input.trim() || saving ? 'var(--ink-4)' : accent,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: input.trim() && !saving ? `0 4px 12px ${accent}4D` : 'none',
              transition: 'background 150ms',
            }}
          >
            {Icon.plus(16)}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          텍스트 입력 · {hasSpeech ? '음성 인식' : '음성(미지원 브라우저)'} · 사진으로 음식 인식
        </div>
      </div>
    </Sheet>
  );
}
