import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "comvi-editor-theme";

type ThemeModule = typeof import("../src/composables/useTheme");

/**
 * `useTheme` resolves its theme once, at module evaluation time, into a
 * module-level singleton — so every case has to re-import a fresh copy.
 */
async function loadThemeModule(): Promise<ThemeModule> {
  vi.resetModules();
  return import("../src/composables/useTheme");
}

function setMatchMedia(impl: ((query: string) => { matches: boolean }) | undefined): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = impl;
}

function hostPrefers(scheme: "light" | "dark"): void {
  setMatchMedia((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && scheme === "dark",
  }));
}

describe("useTheme()", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    hostPrefers("light");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    setMatchMedia(originalMatchMedia);
  });

  describe("initial theme", () => {
    it("a stored 'dark' preference → dark, even though the host page is light", async () => {
      localStorage.setItem(STORAGE_KEY, "dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("dark");
    });

    it("a stored 'light' preference → light, even though the host page is dark", async () => {
      localStorage.setItem(STORAGE_KEY, "light");
      document.documentElement.classList.add("dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("light");
    });

    it("a stored value that is not a theme → ignored, the host page decides", async () => {
      localStorage.setItem(STORAGE_KEY, "solarized");
      hostPrefers("dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("dark");
    });

    it('no stored preference and <html class="dark"> → dark', async () => {
      document.documentElement.classList.add("dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("dark");
    });

    it("no stored preference and a host that prefers dark → dark", async () => {
      hostPrefers("dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("dark");
    });

    it("no stored preference and no dark signal → light", async () => {
      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("light");
    });

    it("a host without matchMedia → light rather than a crash", async () => {
      setMatchMedia(undefined);

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("light");
    });

    it("localStorage that throws on read → the host page decides", async () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage blocked");
      });
      hostPrefers("dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("dark");
    });
  });

  describe("setTheme()", () => {
    it("setTheme('dark') → the theme ref switches to dark", async () => {
      const { useTheme } = await loadThemeModule();
      const { theme, setTheme } = useTheme();

      setTheme("dark");

      expect(theme.value).toBe("dark");
    });

    it("setTheme('dark') → the preference is written under the storage key", async () => {
      const { useTheme } = await loadThemeModule();

      useTheme().setTheme("dark");

      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("a theme set in one session → still in force on the next load", async () => {
      const first = await loadThemeModule();
      first.useTheme().setTheme("dark");

      const { useTheme } = await loadThemeModule();

      expect(useTheme().theme.value).toBe("dark");
    });

    it("localStorage that throws on write → the theme still switches", async () => {
      const { useTheme } = await loadThemeModule();
      const { theme, setTheme } = useTheme();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage full");
      });

      setTheme("dark");

      expect(theme.value).toBe("dark");
    });

    it("two callers → one shared theme, so a change in one is seen by the other", async () => {
      const { useTheme } = await loadThemeModule();
      const first = useTheme();
      const second = useTheme();

      first.setTheme("dark");

      expect(second.theme.value).toBe("dark");
    });
  });

  describe("toggle()", () => {
    it("toggle() from light → dark", async () => {
      const { useTheme } = await loadThemeModule();
      const { theme, toggle } = useTheme();

      toggle();

      expect(theme.value).toBe("dark");
    });

    it("toggle() from dark → light", async () => {
      localStorage.setItem(STORAGE_KEY, "dark");
      const { useTheme } = await loadThemeModule();
      const { theme, toggle } = useTheme();

      toggle();

      expect(theme.value).toBe("light");
    });

    it("toggle() → the new theme is persisted too", async () => {
      const { useTheme } = await loadThemeModule();

      useTheme().toggle();

      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });
  });
});
