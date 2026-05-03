import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [accent, setAccent] = useState('#C8654A');
  const [chatOpen, setChatOpen] = useState(false);
  const [recipe, setRecipe] = useState(null); // meal name string or null

  return (
    <AppContext.Provider value={{ accent, setAccent, chatOpen, setChatOpen, recipe, setRecipe }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
