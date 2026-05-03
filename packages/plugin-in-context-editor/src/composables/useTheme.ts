/**
 * Theme management for the in-context editor.
 *
 * On first load (no stored preference) the theme is auto-detected from the
 * host page: `<html class="dark">` first, then `prefers-color-scheme: dark`.
 * The chosen theme is then persisted in localStorage and stays put — once a
 * user explicitly toggles, we don't follow the host anymore.
 *
 * State is module-level so all component instances (e.g. App + KeySelectorApp)
 * share the same ref and stay in sync without reading localStorage on every
 * mount or relying on cross-instance `storage` events.
 */

import { ref, type InjectionKey, type Ref } from "vue";

const STORAGE_KEY = "comvi-editor-theme";

export type Theme = "light" | "dark";

export interface UseThemeReturn {
  theme: Ref<Theme>;
  setTheme: (value: Theme) => void;
  toggle: () => void;
}

export const THEME_INJECTION_KEY: InjectionKey<UseThemeReturn> = Symbol("comvi-editor-theme");

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable
  }
  return null;
}

function detectHostTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

// Module-level singleton — shared across every useTheme() caller in this bundle.
const themeRef = ref<Theme>(readStoredTheme() ?? detectHostTheme());

function setTheme(value: Theme) {
  themeRef.value = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore — preference will revert on next load
  }
}

function toggle() {
  setTheme(themeRef.value === "dark" ? "light" : "dark");
}

export function useTheme(): UseThemeReturn {
  return { theme: themeRef, setTheme, toggle };
}
