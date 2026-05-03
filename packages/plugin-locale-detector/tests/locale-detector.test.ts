import { describe, expect, it, vi } from "vitest";
import { I18n } from "@comvi/core";
import type { LocaleDetectorOptions } from "../src/index";
import { LocaleDetector, resolveLocale } from "../src/index";
import { mockCookie, mockNavigator, mockWindowLocation } from "./setup";

function createI18n(locale: string = "en"): I18n {
  return new I18n({ locale, exposeGlobal: false });
}

async function initWithPlugin(
  options: LocaleDetectorOptions = {},
  initialLocale: string = "en",
): Promise<I18n> {
  const i18n = createI18n(initialLocale);
  i18n.use(LocaleDetector(options));
  await i18n.init();
  return i18n;
}

type BrowserGlobal = "window" | "document" | "navigator";

async function withDisabledBrowserGlobals(run: () => Promise<void> | void): Promise<void> {
  const keys: BrowserGlobal[] = ["window", "document", "navigator"];
  const descriptors = new Map<BrowserGlobal, PropertyDescriptor | undefined>(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );

  for (const key of keys) {
    Object.defineProperty(globalThis, key, {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }

  try {
    await run();
  } finally {
    for (const key of keys) {
      const descriptor = descriptors.get(key);
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  }
}

describe("LocaleDetector plugin", () => {
  describe("initialization flow", () => {
    it("registers a detector without mutating locale before init", async () => {
      mockWindowLocation("?lng=fr");

      const i18n = createI18n("en");
      const cleanup = LocaleDetector({
        order: ["querystring"],
        caches: [],
      })(i18n);

      expect(i18n.locale).toBe("en");
      expect(await i18n.getLanguageDetector()?.()).toBe("fr");

      cleanup?.();
    });

    it("detects locale from querystring during init", async () => {
      mockWindowLocation("?lng=fr");

      const i18n = await initWithPlugin(
        {
          order: ["querystring"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("fr");
    });

    it("detects and decodes cookie values", async () => {
      mockCookie("i18n_lang=zh%2DCN");

      const i18n = await initWithPlugin(
        {
          order: ["cookie"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("zh");
    });

    it("skips invalid sources and continues in configured order", async () => {
      mockWindowLocation("?lng=en<script>");
      localStorage.setItem("i18n_locale", "de");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "localStorage"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("de");
    });

    it("prefers the first cache target before running detectors", async () => {
      localStorage.setItem("preferred_lang", "fr");
      mockNavigator(["de-DE"], "de-DE");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage"],
          lookupLocalStorage: "preferred_lang",
        },
        "en",
      );

      expect(i18n.locale).toBe("fr");
      expect(localStorage.getItem("preferred_lang")).toBe("fr");
    });

    it("keeps the current locale when detection misses by default", async () => {
      mockWindowLocation("");
      mockNavigator([], "");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "navigator"],
          caches: [],
        },
        "de",
      );

      expect(i18n.locale).toBe("de");
    });

    it("keeps the current locale when browser globals are unavailable", async () => {
      await withDisabledBrowserGlobals(async () => {
        const i18n = await initWithPlugin({}, "de");
        expect(i18n.locale).toBe("de");
      });
    });
  });

  describe("supportedLocales and fallback behavior", () => {
    it("matches exact supported regional variants", async () => {
      mockNavigator(["de-DE"], "de-DE");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
          supportedLocales: ["en", "de-DE", "de-AT"],
        },
        "en",
      );

      expect(i18n.locale).toBe("de-DE");
    });

    it("falls back to the base language when the regional variant is unsupported", async () => {
      mockNavigator(["de-DE"], "de-DE");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
          supportedLocales: ["en", "de", "fr"],
        },
        "en",
      );

      expect(i18n.locale).toBe("de");
    });

    it("matches the first supported regional variant from a base tag", async () => {
      mockNavigator(["pt"], "pt");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
          supportedLocales: ["en", "pt-BR", "pt-PT"],
        },
        "en",
      );

      expect(i18n.locale).toBe("pt-BR");
    });

    it("applies explicit fallback without persisting it as a cached preference", async () => {
      mockNavigator(["ja-JP"], "ja-JP");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage", "cookie"],
          supportedLocales: ["en", "fr"],
          fallbackLocale: "en",
        },
        "de",
      );

      expect(i18n.locale).toBe("en");
      expect(localStorage.getItem("i18n_locale")).toBeNull();
      expect(document.cookie).not.toContain("i18n_lang=en");
    });

    it("lets convertDetectedLocale override supportedLocales", async () => {
      mockNavigator(["de-DE"], "de-DE");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
          supportedLocales: ["en", "de"],
          convertDetectedLocale: (locale) => locale.toLowerCase(),
        },
        "en",
      );

      expect(i18n.locale).toBe("de-de");
    });

    it("caches the custom-converted locale because convertDetectedLocale is authoritative", async () => {
      mockNavigator(["en_US"], "en_US");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage"],
          convertDetectedLocale: (locale) => locale.replace("_", "-"),
        },
        "de",
      );

      expect(i18n.locale).toBe("en-US");
      expect(localStorage.getItem("i18n_locale")).toBe("en-US");
    });
  });

  describe("caching", () => {
    it("populates caches on init even when the detected locale matches the current locale", async () => {
      mockNavigator(["en-US"], "en-US");

      await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage"],
        },
        "en",
      );

      expect(localStorage.getItem("i18n_locale")).toBe("en");
    });

    it("caches a detected locale across all configured targets during init", async () => {
      mockNavigator(["fr-FR"], "fr-FR");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage", "sessionStorage", "cookie"],
        },
        "en",
      );

      expect(i18n.locale).toBe("fr");
      expect(localStorage.getItem("i18n_locale")).toBe("fr");
      expect(sessionStorage.getItem("i18n_locale")).toBe("fr");
      expect(document.cookie).toContain("i18n_lang=fr");
    });

    it("updates caches when the locale changes after init", async () => {
      const cookieSetter = vi.spyOn(document, "cookie", "set");
      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage", "sessionStorage", "cookie"],
          lookupLocalStorage: "custom_lang_key",
          lookupSessionStorage: "session_lang_key",
          lookupCookie: "language",
          cookieOptions: {
            path: "/app",
            domain: "example.com",
            sameSite: "strict",
            secure: true,
          },
          cookieMaxAge: 86400,
        },
        "en",
      );

      await i18n.setLocaleAsync("pt");

      expect(localStorage.getItem("custom_lang_key")).toBe("pt");
      expect(sessionStorage.getItem("session_lang_key")).toBe("pt");

      const cookieWrite = cookieSetter.mock.calls.at(-1)?.[0] as string;
      expect(cookieWrite).toContain("language=pt");
      expect(cookieWrite).toContain("max-age=86400");
      expect(cookieWrite).toContain("path=/app");
      expect(cookieWrite).toContain("domain=example.com");
      expect(cookieWrite).toContain("samesite=strict");
      expect(cookieWrite).toContain("secure");
    });

    it("returns a cleanup function that stops future cache writes", async () => {
      const i18n = createI18n("en");
      const cleanup = LocaleDetector({
        caches: ["localStorage"],
        lookupLocalStorage: "cleanup_test_key",
      })(i18n);

      await i18n.setLocaleAsync("fr");
      expect(localStorage.getItem("cleanup_test_key")).toBe("fr");

      cleanup?.();

      await i18n.setLocaleAsync("de");
      expect(localStorage.getItem("cleanup_test_key")).toBe("fr");
    });

    it("swallows storage write failures", async () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error("Quota exceeded");
      });

      try {
        const i18n = await initWithPlugin(
          {
            order: ["navigator"],
            caches: ["localStorage"],
          },
          "en",
        );

        await expect(i18n.setLocaleAsync("fr")).resolves.toBeUndefined();
        expect(i18n.locale).toBe("fr");
      } finally {
        localStorage.setItem = originalSetItem;
      }
    });
  });

  describe("detection sources and order", () => {
    it("detects locale from sessionStorage", async () => {
      sessionStorage.setItem("i18n_locale", "ja");

      const i18n = await initWithPlugin(
        {
          order: ["sessionStorage"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("ja");
    });

    it("detects locale from sessionStorage with a custom key", async () => {
      sessionStorage.setItem("my_sess_lang", "ko");

      const i18n = await initWithPlugin(
        {
          order: ["sessionStorage"],
          caches: [],
          lookupSessionStorage: "my_sess_lang",
        },
        "en",
      );

      expect(i18n.locale).toBe("ko");
    });

    it("detects locale from a custom querystring parameter", async () => {
      mockWindowLocation("?locale=it");

      const i18n = await initWithPlugin(
        {
          order: ["querystring"],
          caches: [],
          lookupQuerystring: "locale",
        },
        "en",
      );

      expect(i18n.locale).toBe("it");
    });

    it("detects locale from a custom cookie name", async () => {
      mockCookie("app_lang=nl");

      const i18n = await initWithPlugin(
        {
          order: ["cookie"],
          caches: [],
          lookupCookie: "app_lang",
        },
        "en",
      );

      expect(i18n.locale).toBe("nl");
    });

    it("respects detection order and stops at the first match", async () => {
      localStorage.setItem("i18n_locale", "de");
      mockNavigator(["fr-FR"], "fr-FR");

      const i18n = await initWithPlugin(
        {
          order: ["localStorage", "navigator"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("de");
    });

    it("skips empty sources and falls through to the next in order", async () => {
      mockWindowLocation("");
      localStorage.setItem("i18n_locale", "pt");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "localStorage"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("pt");
    });

    it("prefers navigator.languages[0] over navigator.language", async () => {
      mockNavigator(["ja", "en"], "en");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("ja");
    });

    it("falls back to navigator.language when navigator.languages is empty", async () => {
      mockNavigator([], "ko");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("ko");
    });

    it("reads from cookie cache target before running detectors", async () => {
      mockCookie("i18n_lang=es");
      mockNavigator(["de-DE"], "de-DE");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["cookie"],
        },
        "en",
      );

      expect(i18n.locale).toBe("es");
    });

    it("reads from sessionStorage cache target before running detectors", async () => {
      sessionStorage.setItem("i18n_locale", "it");
      mockNavigator(["de-DE"], "de-DE");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["sessionStorage"],
        },
        "en",
      );

      expect(i18n.locale).toBe("it");
    });
  });

  describe("caching edge cases", () => {
    it("caches to sessionStorage with a custom key", async () => {
      mockNavigator(["fr-FR"], "fr-FR");

      await initWithPlugin({
        order: ["navigator"],
        caches: ["sessionStorage"],
        lookupSessionStorage: "sess_lang",
      });

      expect(sessionStorage.getItem("sess_lang")).toBe("fr");
    });

    it("does not cache when detection falls back to default and no fallbackLocale is set", async () => {
      mockWindowLocation("");
      mockNavigator([], "");

      await initWithPlugin(
        {
          order: ["querystring", "navigator"],
          caches: ["localStorage"],
        },
        "en",
      );

      expect(localStorage.getItem("i18n_locale")).toBeNull();
    });

    it("writes to all cache targets on manual locale change even if init was fallback-only", async () => {
      mockNavigator(["ja-JP"], "ja-JP");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage", "sessionStorage"],
          supportedLocales: ["en", "fr"],
          fallbackLocale: "en",
        },
        "de",
      );

      // Fallback resolution — caches should be empty
      expect(localStorage.getItem("i18n_locale")).toBeNull();
      expect(sessionStorage.getItem("i18n_locale")).toBeNull();

      // Manual locale change — caches should be written
      await i18n.setLocaleAsync("fr");
      expect(localStorage.getItem("i18n_locale")).toBe("fr");
      expect(sessionStorage.getItem("i18n_locale")).toBe("fr");
    });
  });

  describe("resolveLocale", () => {
    it("returns exact matches case-insensitively", () => {
      expect(resolveLocale("DE-de", ["en", "de-DE"])).toBe("de-DE");
    });

    it("strips subtags progressively", () => {
      expect(resolveLocale("de-DE-bavarian", ["en", "de-DE", "de"])).toBe("de-DE");
    });

    it("matches a regional variant from a base tag", () => {
      expect(resolveLocale("pt", ["en", "pt-BR", "pt-PT"])).toBe("pt-BR");
    });

    it("supports underscore separators", () => {
      expect(resolveLocale("zh_CN", ["en", "zh-CN"])).toBe("zh-CN");
    });

    it("returns undefined when nothing matches", () => {
      expect(resolveLocale("ja", ["en", "de", "fr"])).toBeUndefined();
    });
  });
});
