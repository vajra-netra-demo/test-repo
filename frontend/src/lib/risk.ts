import type { RiskLevel } from "../types";
import type { Theme } from "../theme/ThemeProvider";

// SVG fill/stroke attributes can't reference CSS custom properties the way
// Tailwind classes can (well, they technically can via var(), but literal
// hex keeps the charts simple and lets values differ per theme without a
// round-trip through getComputedStyle). Mirrors the --color-high/med/low
// tokens in index.css exactly — keep the two in sync if either changes.
// Both sets validated for CVD separation + contrast against their surface
// via dataviz/scripts/validate_palette.js.
const RISK_COLORS_BY_THEME: Record<Theme, Record<RiskLevel, string>> = {
  dark: { High: "#f43f5e", Medium: "#fbbf24", Low: "#34d399" },
  light: { High: "#d64545", Medium: "#d68c1f", Low: "#2e9e5b" },
};

// CSS drop-shadow glow classes (index.css) keyed to each status color —
// theme-agnostic (same rgba glow reads fine on either surface), so this one
// isn't split by theme like the color map above.
export const RISK_GLOW: Record<RiskLevel, string> = {
  High: "glow-high",
  Medium: "glow-med",
  Low: "glow-low",
};

// Non-status chart chrome (text ink, unfilled track, marker ring, accent
// line/node color) that also needs a literal per-theme value for SVG.
const CHART_INK_BY_THEME: Record<Theme, { ink: string; muted: string; track: string; ring: string; accent: string }> = {
  dark: { ink: "#e7ecf6", muted: "#8b96ad", track: "rgba(255,255,255,0.08)", ring: "#0a0f1c", accent: "#22d3ee" },
  light: { ink: "#182035", muted: "#6b7280", track: "rgba(15,23,42,0.08)", ring: "#f4f6fb", accent: "#0891b2" },
};

export function riskColors(theme: Theme) {
  return RISK_COLORS_BY_THEME[theme];
}

export function chartInk(theme: Theme) {
  return CHART_INK_BY_THEME[theme];
}

export function riskLevel(score: number | null | undefined): RiskLevel | null {
  if (score === null || score === undefined) return null;
  if (score >= 70) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}
