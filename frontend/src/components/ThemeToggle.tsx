import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/ThemeProvider";

// Lives in the top-of-screen header (App.tsx), on the main canvas — so
// unlike its previous home in the (always-dark) sidebar, this one DOES use
// the page's theme-flipping tokens (text-muted, border-border, ...) since
// the surface under it actually changes with the theme.
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="glass glass-hover inline-flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
    >
      <span className="relative flex h-5 w-9 items-center rounded-full bg-tint/10 p-0.5">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-[#03151a] shadow-accent-glow transition-transform duration-200 ${
            isDark ? "translate-x-4" : "translate-x-0"
          }`}
        >
          {isDark ? <Moon size={10} strokeWidth={2.5} /> : <Sun size={10} strokeWidth={2.5} />}
        </span>
      </span>
      {isDark ? "Dark mode" : "Light mode"}
    </button>
  );
}
