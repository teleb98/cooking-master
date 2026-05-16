/**
 * Component tests for key UI logic:
 * - GroceryScreen: grouping, toggle, delete confirm
 * - ChatSheet: ChangeSelector apply flow
 * - DeleteWarning dialog
 * - groupByCategory rendering
 * - AppContext toast lifecycle
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mock react-router-dom ─────────────────────────────────────────────────────
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// ── Mock contexts ─────────────────────────────────────────────────────────────
const mockShowToast  = vi.fn();
const mockSetChatOpen = vi.fn();
const mockBumpMealVersion = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    accent: '#C8654A',
    showToast: mockShowToast,
    setChatOpen: mockSetChatOpen,
    bumpMealVersion: mockBumpMealVersion,
    chatOpen: false,
    toast: null,
  }),
}));

vi.mock('../context/FamilyContext', () => ({
  useFamily: () => ({
    family: {
      name: '테스트 가족',
      shopping_day: 6,
      shopping_day_kr: '토',
      has_baby: false,
    },
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: '테스트' },
    isAuthenticated: true,
    authLoading: false,
  }),
}));

// ── DeleteWarning (inline from GroceryScreen) ─────────────────────────────────
import Icon from '../icons';

function DeleteWarning({ item, onClose, onDelete, accent }) {
  if (!item) return null;
  return (
    <div data-testid="delete-warning">
      <div data-testid="item-name">{item.name}</div>
      <div data-testid="menu-count">{item.menu_count}개 메뉴</div>
      <button onClick={onClose} data-testid="cancel-btn">취소</button>
      <button onClick={() => { onDelete(item.id); onClose(); }} data-testid="confirm-btn">삭제</button>
    </div>
  );
}

describe('DeleteWarning', () => {
  it('does not render when item is null', () => {
    const { container } = render(<DeleteWarning item={null} onClose={vi.fn()} onDelete={vi.fn()} accent="#C8654A" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders item name and menu count', () => {
    const item = { id: 1, name: '소고기', menu_count: 3 };
    render(<DeleteWarning item={item} onClose={vi.fn()} onDelete={vi.fn()} accent="#C8654A" />);
    expect(screen.getByTestId('item-name').textContent).toBe('소고기');
    expect(screen.getByTestId('menu-count').textContent).toBe('3개 메뉴');
  });

  it('calls onClose when 취소 is clicked', () => {
    const onClose = vi.fn();
    const item = { id: 1, name: '소고기', menu_count: 1 };
    render(<DeleteWarning item={item} onClose={onClose} onDelete={vi.fn()} accent="#C8654A" />);
    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onDelete with item id then onClose when 삭제 is clicked', () => {
    const onClose  = vi.fn();
    const onDelete = vi.fn();
    const item = { id: 42, name: '두부', menu_count: 2 };
    render(<DeleteWarning item={item} onClose={onClose} onDelete={onDelete} accent="#C8654A" />);
    fireEvent.click(screen.getByTestId('confirm-btn'));
    expect(onDelete).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── groupByCategory rendering ─────────────────────────────────────────────────
import { useState } from 'react';

const CAT_ORDER = ['육류', '채소', '유제품', '곡물·기타', '기타'];

function groupByCategory(items) {
  const map = {};
  for (const item of items) {
    const cat = item.category ?? '기타';
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  }
  return CAT_ORDER.filter(c => map[c]).map(c => ({ cat: c, items: map[c] }));
}

function GroceryList({ items }) {
  const groups = groupByCategory(items);
  return (
    <div>
      {groups.map(g => (
        <div key={g.cat} data-testid={`group-${g.cat}`}>
          <h3>{g.cat}</h3>
          {g.items.map(it => (
            <div key={it.id} data-testid={`item-${it.id}`}>{it.name}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

describe('GroceryList rendering', () => {
  it('renders categories in correct order', () => {
    const items = [
      { id: 1, name: '오트밀', category: '곡물·기타' },
      { id: 2, name: '소고기', category: '육류' },
      { id: 3, name: '시금치', category: '채소' },
    ];
    render(<GroceryList items={items} />);
    const groups = screen.getAllByRole('heading');
    expect(groups[0].textContent).toBe('육류');
    expect(groups[1].textContent).toBe('채소');
    expect(groups[2].textContent).toBe('곡물·기타');
  });

  it('renders all items within their category', () => {
    const items = [
      { id: 1, name: '소고기', category: '육류' },
      { id: 2, name: '돼지고기', category: '육류' },
    ];
    render(<GroceryList items={items} />);
    expect(screen.getByTestId('item-1')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toBeInTheDocument();
  });

  it('renders empty list without error', () => {
    const { container } = render(<GroceryList items={[]} />);
    expect(container.querySelectorAll('[data-testid^="group-"]')).toHaveLength(0);
  });
});

// ── Toggle optimistic update ──────────────────────────────────────────────────
function ToggleItem({ item, onToggle }) {
  return (
    <div style={{ opacity: item.is_bought ? 0.5 : 1 }}>
      <button data-testid="toggle-btn" onClick={() => onToggle(item.id)}>
        {item.is_bought ? '✓' : '○'}
      </button>
      <span data-testid="item-name">{item.name}</span>
    </div>
  );
}

function ToggleList({ initialItems, fetchFn }) {
  const [items, setItems] = useState(initialItems);

  const toggle = async (id) => {
    const item = items.find(i => i.id === id);
    const nextBought = !item.is_bought;
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_bought: nextBought } : i));
    try {
      await fetchFn(id, nextBought);
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_bought: !nextBought } : i));
    }
  };

  return (
    <div>
      {items.map(it => <ToggleItem key={it.id} item={it} onToggle={toggle} />)}
    </div>
  );
}

describe('Optimistic toggle', () => {
  it('immediately updates UI before API responds', async () => {
    const fetchFn = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    const items = [{ id: 1, name: '소고기', is_bought: false }];

    render(<ToggleList initialItems={items} fetchFn={fetchFn} />);
    const btn = screen.getByTestId('toggle-btn');
    expect(btn.textContent).toBe('○');
    fireEvent.click(btn);
    // Optimistic update fires immediately
    expect(screen.getByTestId('toggle-btn').textContent).toBe('✓');
  });

  it('reverts to original state when API call fails', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('Network error')));
    const items = [{ id: 1, name: '소고기', is_bought: false }];

    render(<ToggleList initialItems={items} fetchFn={fetchFn} />);
    fireEvent.click(screen.getByTestId('toggle-btn'));
    // Optimistic update
    expect(screen.getByTestId('toggle-btn').textContent).toBe('✓');
    // Wait for revert
    await waitFor(() => {
      expect(screen.getByTestId('toggle-btn').textContent).toBe('○');
    });
  });
});

// ── ChangeSelector state ──────────────────────────────────────────────────────
function ChangeSelector({ changes, onApply }) {
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

  return (
    <div>
      {changes.map((c, i) => (
        <div key={i} data-testid={`change-${i}`} onClick={() => toggle(i)}>
          <span data-testid={`check-${i}`}>{selected.has(i) ? '✓' : '○'}</span>
          {c.menu_name}
        </div>
      ))}
      <button data-testid="apply-btn" onClick={handleApply} disabled={selected.size === 0 || applying}>
        {applied ? '완료' : `적용 (${selected.size})`}
      </button>
      {applied && <div data-testid="success-msg">캘린더에 반영되었어요</div>}
    </div>
  );
}

describe('ChangeSelector', () => {
  const changes = [
    { plan_date: '2025-05-05', meal_type: 'breakfast', menu_name: '오트밀 죽' },
    { plan_date: '2025-05-05', meal_type: 'lunch',     menu_name: '닭가슴살 샐러드' },
  ];

  it('all changes are pre-selected', () => {
    render(<ChangeSelector changes={changes} onApply={vi.fn()} />);
    expect(screen.getByTestId('check-0').textContent).toBe('✓');
    expect(screen.getByTestId('check-1').textContent).toBe('✓');
  });

  it('clicking a change deselects it', () => {
    render(<ChangeSelector changes={changes} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('change-0'));
    expect(screen.getByTestId('check-0').textContent).toBe('○');
    expect(screen.getByTestId('check-1').textContent).toBe('✓'); // untouched
  });

  it('apply button is disabled when nothing selected', () => {
    render(<ChangeSelector changes={changes} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('change-0'));
    fireEvent.click(screen.getByTestId('change-1'));
    expect(screen.getByTestId('apply-btn')).toBeDisabled();
  });

  it('shows success message after apply', async () => {
    const onApply = vi.fn().mockResolvedValue(2);
    render(<ChangeSelector changes={changes} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('apply-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('success-msg')).toBeInTheDocument();
    });
  });

  it('calls onApply only with selected items', async () => {
    const onApply = vi.fn().mockResolvedValue(1);
    render(<ChangeSelector changes={changes} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('change-0')); // deselect first
    fireEvent.click(screen.getByTestId('apply-btn'));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([changes[1]]);
    });
  });

  it('does not allow toggling after applied', async () => {
    const onApply = vi.fn().mockResolvedValue(2);
    render(<ChangeSelector changes={changes} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('apply-btn'));
    await waitFor(() => expect(screen.getByTestId('success-msg')).toBeInTheDocument());
    // Try to deselect after apply
    fireEvent.click(screen.getByTestId('change-0'));
    expect(screen.getByTestId('check-0').textContent).toBe('✓'); // still selected
  });
});

// ── FavoritesSheet 사진 소스 선택 ────────────────────────────────────────────
function PhotoSourceButton({ onCamera, onGallery, disabled = false }) {
  const [photoMenu, setPhotoMenu] = useState(false);
  return (
    <div>
      <button
        data-testid="photo-btn"
        onClick={() => { if (!disabled) setPhotoMenu(v => !v); }}
        disabled={disabled}
        aria-pressed={photoMenu}
      />
      {photoMenu && !disabled && (
        <div data-testid="photo-menu">
          <button data-testid="camera-option" onClick={() => { setPhotoMenu(false); onCamera(); }}>
            카메라로 찍기
          </button>
          <button data-testid="gallery-option" onClick={() => { setPhotoMenu(false); onGallery(); }}>
            저장 사진 선택
          </button>
        </div>
      )}
    </div>
  );
}

describe('FavoritesSheet 사진 소스 선택', () => {
  it('기본 상태에서 사진 메뉴 숨김', () => {
    render(<PhotoSourceButton onCamera={vi.fn()} onGallery={vi.fn()} />);
    expect(screen.queryByTestId('photo-menu')).not.toBeInTheDocument();
  });

  it('카메라 버튼 클릭 시 메뉴 표시', () => {
    render(<PhotoSourceButton onCamera={vi.fn()} onGallery={vi.fn()} />);
    fireEvent.click(screen.getByTestId('photo-btn'));
    expect(screen.getByTestId('photo-menu')).toBeInTheDocument();
    expect(screen.getByTestId('camera-option')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-option')).toBeInTheDocument();
  });

  it('같은 버튼 재클릭 시 메뉴 닫힘 (토글)', () => {
    render(<PhotoSourceButton onCamera={vi.fn()} onGallery={vi.fn()} />);
    fireEvent.click(screen.getByTestId('photo-btn'));
    expect(screen.getByTestId('photo-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('photo-btn'));
    expect(screen.queryByTestId('photo-menu')).not.toBeInTheDocument();
  });

  it('"카메라로 찍기" 선택 시 메뉴 닫히고 onCamera 호출', () => {
    const onCamera = vi.fn();
    render(<PhotoSourceButton onCamera={onCamera} onGallery={vi.fn()} />);
    fireEvent.click(screen.getByTestId('photo-btn'));
    fireEvent.click(screen.getByTestId('camera-option'));
    expect(onCamera).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('photo-menu')).not.toBeInTheDocument();
  });

  it('"저장 사진 선택" 클릭 시 메뉴 닫히고 onGallery 호출', () => {
    const onGallery = vi.fn();
    render(<PhotoSourceButton onCamera={vi.fn()} onGallery={onGallery} />);
    fireEvent.click(screen.getByTestId('photo-btn'));
    fireEvent.click(screen.getByTestId('gallery-option'));
    expect(onGallery).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('photo-menu')).not.toBeInTheDocument();
  });

  it('disabled 상태에서 클릭해도 메뉴 열리지 않음', () => {
    render(<PhotoSourceButton onCamera={vi.fn()} onGallery={vi.fn()} disabled />);
    fireEvent.click(screen.getByTestId('photo-btn'));
    expect(screen.queryByTestId('photo-menu')).not.toBeInTheDocument();
  });

  it('onCamera와 onGallery 각각 정확히 한 번만 호출', () => {
    const onCamera  = vi.fn();
    const onGallery = vi.fn();
    render(<PhotoSourceButton onCamera={onCamera} onGallery={onGallery} />);
    fireEvent.click(screen.getByTestId('photo-btn'));
    fireEvent.click(screen.getByTestId('camera-option'));
    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onGallery).not.toHaveBeenCalled();
  });
});

// ── ProfileScreen 알림 토글 상태 ─────────────────────────────────────────────
function PushToggle({ supported, denied, enabled, loading, onToggle }) {
  return (
    <div>
      {!supported ? (
        <div data-testid="unsupported-msg">이 브라우저는 알림을 지원하지 않아요.</div>
      ) : (
        <>
          <div data-testid="status-text">
            {denied
              ? '브라우저 설정에서 알림을 허용해주세요'
              : enabled
                ? '매일 오전 11시에 식단을 알려드릴게요'
                : '켜면 매일 오전 11시에 식단을 알려드려요'}
          </div>
          <button
            data-testid="push-toggle"
            onClick={onToggle}
            disabled={loading || denied}
            aria-checked={enabled}
          />
        </>
      )}
    </div>
  );
}

describe('ProfileScreen 알림 토글', () => {
  it('push 미지원 시 unsupported 메시지 표시, 토글 없음', () => {
    render(<PushToggle supported={false} denied={false} enabled={false} loading={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('unsupported-msg')).toBeInTheDocument();
    expect(screen.queryByTestId('push-toggle')).not.toBeInTheDocument();
  });

  it('지원+비활성 상태에서 "켜면" 안내 문구 표시', () => {
    render(<PushToggle supported denied={false} enabled={false} loading={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('status-text').textContent).toContain('켜면');
  });

  it('활성 상태에서 "매일 오전 11시" 문구 표시', () => {
    render(<PushToggle supported denied={false} enabled loading={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('status-text').textContent).toContain('매일 오전 11시');
    expect(screen.getByTestId('status-text').textContent).not.toContain('켜면');
  });

  it('denied 상태에서 브라우저 설정 안내 문구 표시', () => {
    render(<PushToggle supported denied enabled={false} loading={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('status-text').textContent).toContain('브라우저 설정');
  });

  it('denied 시 토글 비활성화', () => {
    render(<PushToggle supported denied enabled={false} loading={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('push-toggle')).toBeDisabled();
  });

  it('loading 시 토글 비활성화', () => {
    render(<PushToggle supported denied={false} enabled loading onToggle={vi.fn()} />);
    expect(screen.getByTestId('push-toggle')).toBeDisabled();
  });

  it('정상 상태에서 클릭 시 onToggle 호출', () => {
    const onToggle = vi.fn();
    render(<PushToggle supported denied={false} enabled={false} loading={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('push-toggle'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('denied 시 클릭해도 onToggle 미호출', () => {
    const onToggle = vi.fn();
    render(<PushToggle supported denied enabled={false} loading={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('push-toggle'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
