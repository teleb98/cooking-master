import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useFamily } from '../context/FamilyContext';
import { useAuth } from '../context/AuthContext';
import Icon from '../icons';

// 냉장고 재료명 정규화 (공백 제거, 소문자)
function normIng(name) { return name.trim().replace(/\s+/g, '').toLowerCase(); }
function fridgeHas(fridgeItems, ingName) {
  const n = normIng(ingName);
  return fridgeItems.some(f => { const fn = normIng(f.name); return fn === n || fn.includes(n) || n.includes(fn); });
}
function getCoverage(recipe, fridgeItems) {
  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (!ings.length || !fridgeItems.length) return null;
  const have = ings.filter(ing => fridgeHas(fridgeItems, ing.name)).length;
  return { have, total: ings.length };
}

const TOKEN_KEY = 'cookingMaster_token';

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
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

function RecipeCard({ recipe, accent, onOpen, coverage }) {
  const emoji = recipeEmoji(recipe.name);
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  const ingCount  = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
  const canMake   = coverage && coverage.have === coverage.total && coverage.total > 0;
  const partial   = coverage && coverage.have > 0 && !canMake;
  return (
    <button
      onClick={onOpen}
      style={{
        background: 'var(--surface)', borderRadius: 14,
        border: canMake ? `1.5px solid #4E9B5F` : '1px solid var(--line)',
        padding: '13px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        textAlign: 'left', width: '100%',
        transition: 'opacity 100ms',
      }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: canMake ? 'rgba(78,155,95,0.10)' : 'var(--bg-2)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{recipe.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {recipe.user_id && (
            <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: accent + '22', color: accent, fontWeight: 700, flexShrink: 0 }}>MY</span>
          )}
          {recipe.baby && (
            <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: 'var(--baby-soft)', color: 'var(--baby-ink)', fontWeight: 600, flexShrink: 0 }}>이유식</span>
          )}
          {canMake && (
            <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: 'rgba(78,155,95,0.15)', color: '#4E9B5F', fontWeight: 700, flexShrink: 0 }}>🧊 바로 만들 수 있어요</span>
          )}
          {partial && (
            <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: 'rgba(78,155,95,0.08)', color: '#4E9B5F', fontWeight: 600, flexShrink: 0 }}>냉장고 {coverage.have}/{coverage.total}가지</span>
          )}
          {(recipe.tags ?? []).slice(0, 2).map(t => (
            <span key={t} style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{t}</span>
          ))}
          {totalTime > 0 && (
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>⏱ {totalTime}분</span>
          )}
          {!coverage && ingCount > 0 && (
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>재료 {ingCount}가지</span>
          )}
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recipes, setRecipes]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [babyOnly, setBabyOnly]   = useState(false);
  const [fridgeOnly, setFridgeOnly] = useState(false);
  const [fridgeItems, setFridgeItems] = useState([]);

  const [showForm, setShowForm]   = useState(false);
  const [formName, setFormName]   = useState('');
  const [formKcal, setFormKcal]   = useState('');
  const [formTags, setFormTags]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRecipes = () => {
    setLoading(true);
    apiFetch('/recipes')
      .then(d => setRecipes(d.recipes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRecipes(); }, []);

  useEffect(() => {
    apiFetch('/fridge')
      .then(d => setFridgeItems(d.items ?? []))
      .catch(() => {});
  }, []);

  const handleCreateRecipe = async () => {
    const name = formName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
      await apiFetch('/recipes', {
        method: 'POST',
        body: JSON.stringify({ name, kcal: formKcal || undefined, tags, create: true }),
      });
      setShowForm(false);
      setFormName(''); setFormKcal(''); setFormTags('');
      loadRecipes();
    } catch (err) {
      alert(err.message.includes('409') ? '같은 이름의 레시피가 이미 있습니다.' : '레시피 추가에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const allTags = useMemo(() => {
    const tagSet = new Set();
    for (const r of recipes) for (const t of (r.tags ?? [])) tagSet.add(t);
    return [...tagSet].sort();
  }, [recipes]);

  const coverageMap = useMemo(() => {
    if (!fridgeItems.length) return {};
    const map = {};
    for (const r of recipes) {
      const cov = getCoverage(r, fridgeItems);
      if (cov) map[r.name] = cov;
    }
    return map;
  }, [recipes, fridgeItems]);

  const filtered = useMemo(() => recipes.filter(r => {
    if (search && !r.name.includes(search) && !(r.tags ?? []).some(t => t.includes(search))) return false;
    if (activeTag && !(r.tags ?? []).includes(activeTag)) return false;
    if (babyOnly && !r.baby) return false;
    if (fridgeOnly) {
      const cov = coverageMap[r.name];
      if (!cov || cov.have === 0) return false;
    }
    return true;
  }), [recipes, search, activeTag, babyOnly, fridgeOnly, coverageMap]);

  const handleTagClick = (tag) => {
    setActiveTag(t => t === tag ? null : tag);
    setBabyOnly(false);
    setFridgeOnly(false);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', position: 'relative',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* 커스텀 레시피 추가 폼 오버레이 */}
      {showForm && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--bg)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 'calc(env(safe-area-inset-top, 12px) + 12px) 18px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowForm(false)} style={{ color: 'var(--ink-3)', display: 'flex' }}>
              {Icon.close(20)}
            </button>
            <div style={{ flex: 1 }}>
              <div className="kr-en">CUSTOM · 나만의 레시피</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>레시피 추가</div>
            </div>
          </div>

          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 24px' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>이름 *</label>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="예: 엄마표 김치볶음밥"
              style={{
                display: 'block', width: '100%', marginTop: 6, marginBottom: 18,
                padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--line)', background: 'var(--surface)',
                fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>칼로리 kcal (선택)</label>
            <input
              type="number" inputMode="numeric"
              value={formKcal}
              onChange={e => setFormKcal(e.target.value)}
              placeholder="예: 480"
              style={{
                display: 'block', width: '100%', marginTop: 6, marginBottom: 18,
                padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--line)', background: 'var(--surface)',
                fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>태그 (쉼표로 구분, 선택)</label>
            <input
              value={formTags}
              onChange={e => setFormTags(e.target.value)}
              placeholder="예: 한식, 볶음, 간편식"
              style={{
                display: 'block', width: '100%', marginTop: 6, marginBottom: 8,
                padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--line)', background: 'var(--surface)',
                fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 24px 2px' }}>
              레시피를 추가한 후 탭하면 AI가 조리법을 자동으로 생성해 드려요.
            </p>
          </div>

          <div style={{ padding: '0 18px calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
            <button
              onClick={handleCreateRecipe}
              disabled={!formName.trim() || submitting}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 14,
                background: accent, color: '#fff', fontSize: 15, fontWeight: 700,
                opacity: !formName.trim() ? 0.45 : 1,
              }}
            >
              {submitting ? '추가 중…' : '추가하기'}
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ padding: 'calc(env(safe-area-inset-top, 12px) + 12px) 18px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="kr-en">RECIPES · 레시피 탐색</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 2, letterSpacing: '-0.01em' }}>
            {loading ? '레시피' : `${recipes.length}가지 레시피`}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 20,
            background: accent, color: '#fff',
            fontSize: 12.5, fontWeight: 700,
          }}
        >
          + 추가
        </button>
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
          active={!activeTag && !babyOnly && !fridgeOnly}
          accent={accent}
          onClick={() => { setActiveTag(null); setBabyOnly(false); setFridgeOnly(false); }}
        >전체 {!activeTag && !babyOnly && !fridgeOnly && recipes.length > 0 ? `${recipes.length}` : ''}</Chip>
        {fridgeItems.length > 0 && (
          <Chip
            active={fridgeOnly}
            accent="#4E9B5F"
            onClick={() => { setFridgeOnly(f => !f); setActiveTag(null); setBabyOnly(false); }}
          >🧊 냉장고 재료로</Chip>
        )}
        {family.has_baby && (
          <Chip
            active={babyOnly}
            accent={accent}
            onClick={() => { setBabyOnly(b => !b); setActiveTag(null); setFridgeOnly(false); }}
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
                coverage={coverageMap[r.name] ?? null}
                onOpen={() => setRecipe({ name: r.name, userId: r.user_id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
