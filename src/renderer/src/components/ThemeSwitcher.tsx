import React from "react";
import { Moon, Sun, Sparkles } from "lucide-react";
import { useTheme, ThemeName } from "../lib/theme";

const OPTIONS: { id: ThemeName; label: string; icon: React.ReactNode }[] = [
  { id: "dark", label: "Dark", icon: <Moon size={13} /> },
  { id: "light", label: "Light", icon: <Sun size={13} /> },
  { id: "midnight", label: "Midnight", icon: <Sparkles size={13} /> },
];

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-switcher">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          className={theme === opt.id ? "active" : ""}
          onClick={() => setTheme(opt.id)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
