import type { ThemeMode } from "./types";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}
