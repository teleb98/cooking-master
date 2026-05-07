import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import Icon from '../icons';

const TOKEN_KEY = 'cookingMaster_token';

async function apiFetch(path) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const NAME_EMOJI = [
  [/국|찌개|탕|수프|스프/,  '🍲'],
  [/볶음|볶기/,             '🥘'],
  [/구이|구워/,             '🔥'],
  [/샐러드/,               '🥗'],
  [/죽|오트밀/,             '🥣'],
  [/파스타|리조또|스파게티/, '🍝'],
  [/토스트|빵|샌드/,        '🍞'],
  [/초밥|스시|돈카츠/,      '🍱'],
  [/피자/,                 '🍕'],
  [/비빔밥|덮밥|볶음밥/,    '🍚'],
  [/요거트|요구르트/,        '🥛'],
  [/잡채|면|국수/,          '🍜'],
  [/갈비|삼겹|제육/,        '🥩'],
  [/닭|치킨/,              '🍗'],
  [/연어|고등어|생선|해산물/, '🐟'],
];

function recipeEmoji(name) {
  for (const [re, emoji] of NAME_EMOJI) {
    if (re.test(name)) return emoji;
  }
  return '🍳';
}

function Chip({ children, active, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 15px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
        fontSize: 12.5, fontWeight: 600,
        background: active ? (accent ?? 'var(--ink)') : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-2)',
        border: active ? 'none' : '1px solid var(--line)',
        transition: 'background 150ms, color 150ms',
      }}
    >
      {children}
    </button>
  );
}

function RecipeCard({ recipe, accent, onOpen }) {
  const emoji = recipeEmoji(recipe.name);
  return (
    <button
      onClick={onOpen}
      style={{
        background: 'var(--surface)', borderRadius: 14,
        border: '1px solid var(--line)', padding: '13px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        textAlign: 'left', width: '100%',
        transition: 'opacity 100ms',
      }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: 'var(--bg-2)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{recipe.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {recipe.baby && (
            <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 600, flexShrink: 0 }}>이유식</span>
          )}
          {(recipe.tags ?? []).slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{recipe.kcal}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>kcal</div>
      </div>
    </button>
  );
}

export default function RecipeScreen() {
  const { accent, setRecipe } = useApp();
  const { family } = useFamily();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [babyOnly, setBabyOnly] = useState(false);

  useEffect(() => {
    apiFetch('/recipes')
      .then(d => setRecipes(d.recipes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    for (const r of recipes) for (const t of (r.tags ?? [])) tagSet.add(t);
    return [...tagSet].sort();
  }, [recipes]);

  const filtered = useMemo(() => recipes.filter(r => {
    if (search && !r.name.includes(search) && !(r.tags ?? []).some(t => t.includes(search))) return false;
    if (activeTag && !(r.tags ?? []).includes(activeTag)) return false;
    if (babyOnly && !r.baby) return false;
    return true;
  }), [recipes, search, activeTag, babyOnly]);

  const handleTagClick = (tag) => {
    setActiveTag(t => t === tag ? null : tag);
    setBabyOnly(false);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* 헤더 */}
      <div style={{ padding: 'calc(env(safe-area-inset-top, 12px) + 12px) 18px 12px' }}>
        <div className="kr-en">RECIPES · 레시피 탐색</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 2, letterSpacing: '-0.01em' }}>
          {loading ? '레시피' : `${recipes.length}가지 레시피`}
        </div>
      </div>

      {/* 검색바 */}
      <div style={{ padding: '0 18px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 12, padding: '11px 14px',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="레시피 이름, 재료 검색"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'var(--ink-4)', display: 'flex', alignItems: 'center' }}>
              {Icon.close(14)}
            </button>
          )}
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="no-scrollbar" style={{ padding: '0 18px 12px', overflowX: 'auto', display: 'flex', gap: 7 }}>
        <Chip
          active={!activeTag && !babyOnly}
          accent={accent}
          onClick={() => { setActiveTag(null); setBabyOnly(false); }}
        >전체 {!activeTag && !babyOnly && recipes.length > 0 ? `${recipes.length}` : ''}</Chip>
        {family.has_baby && (
          <Chip
            active={babyOnly}
            accent={accent}
            onClick={() => { setBabyOnly(b => !b); setActiveTag(null); }}
          >🥣 이유식</Chip>
        )}
        {allTags.map(tag => (
          <Chip key={tag} active={activeTag === tag} accent={accent} onClick={() => handleTagClick(tag)}>
            {tag}
          </Chip>
        ))}
      </div>

      {/* 검색 결과 수 */}
      {(search || activeTag || babyOnly) && !loading && (
        <div style={{ padding: '0 22px 8px', fontSize: 11.5, color: 'var(--ink-3)' }}>
          {filtered.length}개 결과
        </div>
      )}

      {/* 목록 */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 16px' }}>
        {loading && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>불러오는 중...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>검색 결과가 없어요</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>다른 키워드로 검색해보세요</div>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => (
              <RecipeCard
                key={r.name}
                recipe={r}
                accent={accent}
                onOpen={() => setRecipe({ name: r.name })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
