import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useAppearanceStore } from "@/store/useAppearanceStore";

export function ThemeToggle() {
  const theme = useAppearanceStore((state) => state.theme);
  const setTheme = useAppearanceStore((state) => state.setTheme);
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = theme;
  }, [isDark, theme]);

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
      }}
      className="appearance-theme tap-spring"
      aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
      title={isDark ? "浅色主题" : "深色主题"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
