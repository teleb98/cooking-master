import { createContext, useContext, useState, useCallback, useRef } from 'react';

const AppContext = createContext(null);

const ACCENT_KEY = 'cookingMaster_accent';

export function AppProvider({ children }) {
  const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_KEY) ?? '#C8654A');
  const [chatOpen, setChatOpen] = useState(false);
  // recipe: { name, plan_date, meal_type } | null
  const [recipe, setRecipe] = useState(null);
  // replaceSlot: set by RecipeSheet "교체" → CalendarScreen watches and opens MealPicker
  const [replaceSlot, setReplaceSlot] = useState(null);
  // mealVersion: incremented when meals are changed externally (e.g. AI chat apply)
  const [mealVersion, setMealVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const setAccent = useCallback((v) => {
    setAccentState(v);
    localStorage.setItem(ACCENT_KEY, v);
  }, []);

  const bumpMealVersion = useCallback(() => setMealVersion(v => v + 1), []);

  const showToast = useCallback((msg, type = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <AppContext.Provider value={{ accent, setAccent, chatOpen, setChatOpen, recipe, setRecipe, replaceSlot, setReplaceSlot, mealVersion, bumpMealVersion, toast, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
