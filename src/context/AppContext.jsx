import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [accent, setAccent] = useState('#C8654A');
  const [chatOpen, setChatOpen] = useState(false);
  // recipe: { name, plan_date, meal_type } | null
  const [recipe, setRecipe] = useState(null);
  // replaceSlot: set by RecipeSheet "교체" → CalendarScreen watches and opens MealPicker
  const [replaceSlot, setReplaceSlot] = useState(null);

  return (
    <AppContext.Provider value={{ accent, setAccent, chatOpen, setChatOpen, recipe, setRecipe, replaceSlot, setReplaceSlot }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
