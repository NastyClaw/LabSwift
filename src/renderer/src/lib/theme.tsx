import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeName = "dark" | "light" | "midnight";

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  setTheme: () => {},
});

const VALID_THEMES: ThemeName[] = ["dark", "light", "midnight"];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    window.labswift.storeGet("theme").then((stored) => {
      const t = stored as ThemeName | undefined;
      if (t && VALID_THEMES.includes(t)) {
        setThemeState(t);
        document.documentElement.setAttribute("data-theme", t);
      }
    });
  }, []);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    window.labswift.storeSet("theme", t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
