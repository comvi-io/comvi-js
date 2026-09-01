import { describe, expect, it, vi } from "vitest";
import { createI18n, initWithPlugin } from "./helpers/init";
import { LocaleDetector, resolveLocale } from "../src/index";
import {
  mockCookie,
  mockNavigator,
  mockNavigatorWithoutLanguages,
  mockWindowLocation,
  withDisabledBrowserGlobals,
} from "./setup";

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

    it("skips unsupported sources and continues in configured order", async () => {
      mockWindowLocation("?language=es");
      localStorage.setItem("lang", "de");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "localStorage"],
          caches: ["localStorage"],
          cacheFirst: false,
          lookupQuerystring: "language",
          lookupLocalStorage: "lang",
          supportedLocales: ["en", "de", "fr"],
        },
        "en",
      );

      expect(i18n.locale).toBe("de");
      expect(localStorage.getItem("lang")).toBe("de");
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

    it("ignores an unsupported first cache value and continues to the detection order", async () => {
      localStorage.setItem("preferred_lang", "es");
      mockWindowLocation("?language=fr");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "navigator"],
          caches: ["localStorage"],
          lookupQuerystring: "language",
          lookupLocalStorage: "preferred_lang",
          supportedLocales: ["en", "de", "fr"],
        },
        "en",
      );

      expect(i18n.locale).toBe("fr");
      expect(localStorage.getItem("preferred_lang")).toBe("fr");
    });

    it("lets order govern priority when cacheFirst is false", async () => {
      mockWindowLocation("?language=fr");
      localStorage.setItem("lang", "de");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "localStorage", "navigator"],
          caches: ["localStorage"],
          cacheFirst: false,
          lookupQuerystring: "language",
          lookupLocalStorage: "lang",
          supportedLocales: ["en", "de", "fr"],
        },
        "en",
      );

      expect(i18n.locale).toBe("fr");
      expect(localStorage.getItem("lang")).toBe("fr");
    });

    it("still reads the storage via order when cacheFirst is false and no query is present", async () => {
      mockWindowLocation("");
      localStorage.setItem("lang", "de");

      const i18n = await initWithPlugin(
        {
          order: ["querystring", "localStorage", "navigator"],
          caches: ["localStorage"],
          cacheFirst: false,
          lookupQuerystring: "language",
          lookupLocalStorage: "lang",
          supportedLocales: ["en", "de", "fr"],
        },
        "en",
      );

      expect(i18n.locale).toBe("de");
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

    const initWithEveryCacheTarget = () =>
      initWithPlugin(
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

    it("writes every configured cache target on a post-init locale change", async () => {
      const cookieSetter = vi.spyOn(document, "cookie", "set");
      const i18n = await initWithEveryCacheTarget();

      await i18n.setLocaleAsync("pt");

      expect(localStorage.getItem("custom_lang_key")).toBe("pt");
      expect(sessionStorage.getItem("session_lang_key")).toBe("pt");
      expect(cookieSetter.mock.calls.at(-1)?.[0]).toContain("language=pt");
    });

    it("serializes cookieOptions and cookieMaxAge into one cookie write", async () => {
      const cookieSetter = vi.spyOn(document, "cookie", "set");
      const i18n = await initWithEveryCacheTarget();

      await i18n.setLocaleAsync("pt");

      expect(cookieSetter.mock.calls.at(-1)?.[0]).toBe(
        "language=pt; max-age=86400; path=/app; samesite=strict; domain=example.com; secure",
      );
    });

    it("forces Secure when sameSite is none", async () => {
      const cookieSetter = vi.spyOn(document, "cookie", "set");
      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["cookie"],
          lookupCookie: "language",
          cookieOptions: {
            sameSite: "none",
          },
        },
        "en",
      );

      await i18n.setLocaleAsync("pt");

      const cookieWrite = cookieSetter.mock.calls.at(-1)?.[0] as string;
      expect(cookieWrite).toContain("samesite=none");
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
      // Must be the INSTANCE: a `Storage.prototype` spy is never reached by
      // `localStorage.setItem` in a full-file run, which makes this test vacuous.
      // `restoreMocks` does not restore an inherited-member spy, hence the finally.
      const setItemSpy = vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
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
        // Both writes (init's cache populate and the change above) really threw, so
        // the resolution asserted above is the swallow and not an untaken path.
        expect(setItemSpy.mock.results.map((result) => result.type)).toEqual(["throw", "throw"]);
      } finally {
        setItemSpy.mockRestore();
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

    it("reads a sessionStorage cache target under the session key, not the localStorage key", async () => {
      sessionStorage.setItem("sess_lang", "it");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["sessionStorage"],
          lookupSessionStorage: "sess_lang",
          lookupLocalStorage: "local_lang",
        },
        "en",
      );

      expect(i18n.locale).toBe("it");
    });

    it("falls back to navigator.language when navigator.languages is absent", async () => {
      mockNavigatorWithoutLanguages("ko");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: [],
        },
        "en",
      );

      expect(i18n.locale).toBe("ko");
    });

    it("continues to the next source when reading storage throws", async () => {
      // Privacy mode: `getItem` itself throws. Must be the INSTANCE spy — see the
      // note on the write-failure test — and `restoreMocks` does not restore it.
      const getItemSpy = vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      try {
        mockNavigator(["fr-FR"], "fr-FR");

        const i18n = await initWithPlugin(
          {
            order: ["localStorage", "navigator"],
            caches: [],
          },
          "en",
        );

        expect(i18n.locale).toBe("fr");
        expect(getItemSpy.mock.results.map((result) => result.type)).toEqual(["throw"]);
      } finally {
        getItemSpy.mockRestore();
      }
    });
  });

  describe("locale tag validation", () => {
    // 35 characters, the inclusive upper bound; the second is the same tag one character over.
    const TAG_AT_LIMIT = "en-abcdefgh-abcdefgh-abcdefgh-abcde";
    const TAG_OVER_LIMIT = "en-abcdefgh-abcdefgh-abcdefgh-abcdef";

    it("accepts a 35-character tag", async () => {
      mockWindowLocation(`?lng=${TAG_AT_LIMIT}`);

      const i18n = await initWithPlugin(
        {
          order: ["querystring"],
          caches: [],
        },
        "de",
      );

      expect(i18n.locale).toBe("en");
    });

    it("rejects a 36-character tag", async () => {
      mockWindowLocation(`?lng=${TAG_OVER_LIMIT}`);

      const i18n = await initWithPlugin(
        {
          order: ["querystring"],
          caches: [],
        },
        "de",
      );

      expect(i18n.locale).toBe("de");
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

      expect(localStorage.getItem("i18n_locale")).toBeNull();
      expect(sessionStorage.getItem("i18n_locale")).toBeNull();

      await i18n.setLocaleAsync("fr");
      expect(localStorage.getItem("i18n_locale")).toBe("fr");
      expect(sessionStorage.getItem("i18n_locale")).toBe("fr");
    });

    it("skips every cache target when browser globals are unavailable", async () => {
      await withDisabledBrowserGlobals(async () => {
        const i18n = createI18n("en");
        const cleanup = LocaleDetector({
          caches: ["localStorage", "sessionStorage", "cookie"],
        })(i18n);

        await expect(i18n.setLocaleAsync("fr")).resolves.toBeUndefined();

        expect(i18n.locale).toBe("fr");

        cleanup?.();
      });
    });

    it("does not persist a locale the registered detector only reported", async () => {
      mockWindowLocation("?lng=fr");
      const i18n = createI18n("en");
      const cleanup = LocaleDetector({
        order: ["querystring"],
        caches: ["localStorage"],
      })(i18n);

      const reported = await i18n.getLanguageDetector()?.();

      expect(reported).toBe("fr");
      expect(i18n.locale).toBe("en");
      expect(localStorage.getItem("i18n_locale")).toBeNull();

      cleanup?.();
    });

    it("fills the remaining cache targets when the cached locale already is the current locale", async () => {
      localStorage.setItem("i18n_locale", "fr");
      mockNavigator(["de-DE"], "de-DE");
      const cookieSetter = vi.spyOn(document, "cookie", "set");

      const i18n = await initWithPlugin(
        {
          order: ["navigator"],
          caches: ["localStorage", "cookie"],
        },
        "fr",
      );

      expect(i18n.locale).toBe("fr");
      expect(cookieSetter.mock.calls.at(-1)?.[0]).toContain("i18n_lang=fr");
    });

    it("persists a later locale change after the detector reported only the fallback", async () => {
      mockWindowLocation("");
      const i18n = createI18n("en");
      const cleanup = LocaleDetector({
        order: ["querystring"],
        caches: ["localStorage"],
        fallbackLocale: "fr",
      })(i18n);

      expect(await i18n.getLanguageDetector()?.()).toBe("fr");

      await i18n.setLocaleAsync("de");

      expect(localStorage.getItem("i18n_locale")).toBe("de");

      cleanup?.();
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

    it("prefers an exact match over a sibling regional variant", () => {
      expect(resolveLocale("pt-PT", ["pt-BR", "pt-PT"])).toBe("pt-PT");
    });

    it("prefers the base language over a sibling regional variant", () => {
      expect(resolveLocale("de-DE", ["de-AT", "de"])).toBe("de");
    });

    it("prefers the base language when the detected tag uses an underscore separator", () => {
      expect(resolveLocale("zh_CN", ["zh", "zh-CN"])).toBe("zh");
    });

    it("returns undefined when nothing matches", () => {
      expect(resolveLocale("ja", ["en", "de", "fr"])).toBeUndefined();
    });
  });
});
