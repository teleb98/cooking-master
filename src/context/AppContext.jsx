import { createContext, useContext, useState, useCallback, useRef } from 'react';

const AppContext = createContext(null);

const ACCENT_KEY   = 'cookingMaster_accent';
const ONBOARD_KEY  = 'cookingMaster_onboarded';
const THEME_KEY    = 'cookingMaster_theme';

export function AppProvider({ children }) {
  const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_KEY) ?? '#C8654A');
  const [theme,  setThemeState]  = useState(() => localStorage.getItem(THEME_KEY)  ?? 'light');
  const [chatOpen, setChatOpen] = useState(false);
  // recipe: { name, plan_date, meal_type } | null
  const [recipe, setRecipe] = useState(null);
  // replaceSlot: set by RecipeSheet "교체" → CalendarScreen watches and opens MealPicker
  const [replaceSlot, setReplaceSlot] = useState(null);
  // favoritesOpen: 즐겨찾기 시트 / favoriteSeed: RecipeSheet에서 열 때 미리 채울 메뉴명
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteSeed, setFavoriteSeed]   = useState(null);
  // mealVersion: incremented when meals are changed externally (e.g. AI chat apply)
  const [mealVersion, setMealVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  // onboarded: React state so route re-renders reactively when flag is set
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem(ONBOARD_KEY));

  const setAccent = useCallback((v) => {
    setAccentState(v);
    localStorage.setItem(ACCENT_KEY, v);
  }, []);

  const setTheme = useCallback((v) => {
    setThemeState(v);
    localStorage.setItem(THEME_KEY, v);
    document.documentElement.setAttribute('data-theme', v === 'dark' ? 'dark' : '');
  }, []);

  const bumpMealVersion = useCallback(() => setMealVersion(v => v + 1), []);

  const showToast = useCallback((msg, type = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const markOnboarded = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setOnboarded(true);
  }, []);

  const clearOnboarded = useCallback(() => {
    localStorage.removeItem(ONBOARD_KEY);
    setOnboarded(false);
  }, []);

  return (
    <AppContext.Provider value={{ accent, setAccent, theme, setTheme, chatOpen, setChatOpen, recipe, setRecipe, replaceSlot, setReplaceSlot, mealVersion, bumpMealVersion, toast, showToast, onboarded, markOnboarded, clearOnboarded, favoritesOpen, setFavoritesOpen, favoriteSeed, setFavoriteSeed }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
