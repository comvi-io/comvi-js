import { describe, it, expect, vi } from "vitest";
import {
  attachLoader,
  attachPlugins,
  createCore,
  createI18n,
  createI18nFromCore,
  useI18n,
} from "../src";
import { nextTick, isRef, effectScope } from "vue";
import { mount } from "@vue/test-utils";

describe("New Features", () => {
  describe("Cached translationCache computed", () => {
    it("should update cache ref when translations are added", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      const cache = i18n.translationCache;

      expect(cache.value.size).toBe(0);

      i18n.addTranslations({
        en: { hello: "Hello", goodbye: "Bye" },
      });

      await nextTick();

      expect(cache.value.size).toBe(1);
      expect(cache.value.has("en:common")).toBe(true);
      const enCommon = cache.value.get("en:common");
      expect(enCommon).toEqual({ hello: "Hello", goodbye: "Bye" });
    });

    it("should update cache ref when translations for multiple languages are added", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      const cache = i18n.translationCache;

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      await nextTick();

      expect(cache.value.size).toBe(2);
      expect(cache.value.get("en:common")).toEqual({ hello: "Hello" });
      expect(cache.value.get("fr:common")).toEqual({ hello: "Bonjour" });
    });
  });

  describe("on() method", () => {
    it("should expose on() and fire callback when event is triggered", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello" },
      });

      const spy = vi.fn();
      const unsub = i18n.on("missingKey", spy);

      i18n.t("nonexistent");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        key: "nonexistent",
        locale: "en",
        namespace: "common",
      });

      unsub();
    });

    it("should subscribe to localeChanged event", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      const spy = vi.fn();
      const unsubscribe = i18n.on("localeChanged", spy);

      i18n.locale = "fr";
      await nextTick();

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ from: "en", to: "fr" });
      });

      unsubscribe();
    });

    it("should unsubscribe when calling returned function", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
        de: { hello: "Hallo" },
      });

      const spy = vi.fn();
      const unsubscribe = i18n.on("localeChanged", spy);

      i18n.locale = "fr";
      await nextTick();

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledTimes(1);
      });

      unsubscribe();

      i18n.locale = "de";
      await vi.waitFor(() => {
        expect(i18n.locale.value).toBe("de");
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should subscribe to missingKey event", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      const spy = vi.fn();
      i18n.on("missingKey", spy);

      i18n.t("nonexistent.key");

      expect(spy).toHaveBeenCalledWith({
        key: "nonexistent.key",
        locale: "en",
        namespace: "common",
      });
    });

    it("should subscribe to namespaceLoaded event", async () => {
      const loader = vi.fn(async () => ({ title: "Title" }));

      const i18n = createI18nFromCore(
        createCore({ locale: "en", defaultNs: "common" }).with(attachLoader),
      );
      i18n.core.registerLoader(loader);
      await i18n.init();

      const spy = vi.fn();
      i18n.on("namespaceLoaded", spy);

      await i18n.core.addActiveNamespace("admin");

      expect(spy).toHaveBeenCalledWith({
        namespace: "admin",
        locale: "en",
      });
    });
  });

  describe("SSR support (ssrLocale option)", () => {
    it("should use ssrLocale for initial locale state to prevent hydration mismatch", () => {
      // `ssrLocale` makes the client-side ref match the server-rendered HTML,
      // which is what keeps hydration from warning about mismatched text.
      const i18n = createI18n({
        locale: "en",
        ssrLocale: "fr",
      });

      expect(i18n.locale.value).toBe("fr");
    });

    it("should use regular locale when ssrLocale is not provided", () => {
      const i18n = createI18n({
        locale: "en",
      });

      expect(i18n.locale.value).toBe("en");
    });

    it("should use ssrLocale as core locale before and after initialization", async () => {
      const i18n = createI18n({
        locale: "en",
        ssrLocale: "fr",
        defaultNs: "common",
      });

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      // `ssrLocale` drives translations before init, not after.
      expect(i18n.t("hello")).toBe("Bonjour");
      expect(i18n.locale.value).toBe("fr");

      await i18n.init();

      expect(i18n.locale.value).toBe("fr");
      expect(i18n.t("hello")).toBe("Bonjour");
    });

    it("should keep ssrLocale when it matches the core locale after init", async () => {
      const i18n = createI18n({
        locale: "fr",
        ssrLocale: "fr",
        defaultNs: "common",
      });

      i18n.addTranslations({
        fr: { hello: "Bonjour" },
      });

      expect(i18n.locale.value).toBe("fr");

      await i18n.init();

      expect(i18n.locale.value).toBe("fr");
    });
  });

  describe("hasTranslationNow / hasLocaleNow (imperative, non-reactive)", () => {
    it("hasTranslationNow returns a plain boolean (not a ref)", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { greeting: "Hello" } });
      await i18n.init();

      const result = i18n.hasTranslationNow("greeting");
      expect(typeof result).toBe("boolean");
      expect(isRef(result)).toBe(false);
    });

    it("hasTranslationNow returns true for an existing key and false for a missing key", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { greeting: "Hello" } });
      await i18n.init();

      expect(i18n.hasTranslationNow("greeting")).toBe(true);
      expect(i18n.hasTranslationNow("nonexistent.key")).toBe(false);
    });

    it("hasTranslationNow result matches reactive hasTranslation().value", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { greeting: "Hello" } });
      await i18n.init();

      const scope = effectScope();
      let reactiveHasGreeting!: boolean;
      let reactiveHasMissing!: boolean;
      scope.run(() => {
        reactiveHasGreeting = i18n.hasTranslation("greeting").value;
        reactiveHasMissing = i18n.hasTranslation("missing.key").value;
      });
      scope.stop();

      expect(i18n.hasTranslationNow("greeting")).toBe(reactiveHasGreeting);
      expect(i18n.hasTranslationNow("missing.key")).toBe(reactiveHasMissing);
    });

    it("hasTranslationNow can be called in a loop outside any effectScope without throwing", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { key0: "v0", key1: "v1", key2: "v2" } });
      await i18n.init();

      const results: boolean[] = [];
      expect(() => {
        for (let i = 0; i < 50; i++) {
          results.push(i18n.hasTranslationNow(`key${i % 3}`));
        }
      }).not.toThrow();

      for (const r of results) {
        expect(typeof r).toBe("boolean");
        expect(isRef(r)).toBe(false);
      }
    });

    it("hasLocaleNow returns a plain boolean (not a ref)", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { hello: "Hello" }, fr: { hello: "Bonjour" } });
      await i18n.init();

      const result = i18n.hasLocaleNow("en");
      expect(typeof result).toBe("boolean");
      expect(isRef(result)).toBe(false);
    });

    it("hasLocaleNow returns true for a loaded locale and false for an absent one", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { hello: "Hello" } });
      await i18n.init();

      expect(i18n.hasLocaleNow("en")).toBe(true);
      expect(i18n.hasLocaleNow("fr")).toBe(false);
    });

    it("hasLocaleNow result matches reactive hasLocale().value", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { hello: "Hello" } });
      await i18n.init();

      const scope = effectScope();
      let reactiveHasEn!: boolean;
      let reactiveHasFr!: boolean;
      scope.run(() => {
        reactiveHasEn = i18n.hasLocale("en").value;
        reactiveHasFr = i18n.hasLocale("fr").value;
      });
      scope.stop();

      expect(i18n.hasLocaleNow("en")).toBe(reactiveHasEn);
      expect(i18n.hasLocaleNow("fr")).toBe(reactiveHasFr);
    });

    it("hasTranslation() returns a ComputedRef while hasTranslationNow() returns a primitive", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { greeting: "Hello" } });
      await i18n.init();

      const scope = effectScope();
      let reactiveResult: ReturnType<typeof i18n.hasTranslation>;
      scope.run(() => {
        reactiveResult = i18n.hasTranslation("greeting");
        expect(isRef(reactiveResult!)).toBe(true);
        expect(typeof reactiveResult!.value).toBe("boolean");
      });
      scope.stop();

      const imperativeResult = i18n.hasTranslationNow("greeting");
      expect(typeof imperativeResult).toBe("boolean");
      expect(isRef(imperativeResult)).toBe(false);
    });

    it("hasTranslationNow and hasLocaleNow are reachable via useI18n()", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ en: { hello: "Hello" } });
      await i18n.init();

      let hasTranslationNowFn: ((key: string) => boolean) | undefined;
      let hasLocaleNowFn: ((locale: string) => boolean) | undefined;

      const C = {
        setup() {
          const composable = useI18n();
          hasTranslationNowFn = composable.hasTranslationNow;
          hasLocaleNowFn = composable.hasLocaleNow;
          return () => null;
        },
      };

      mount(C, { global: { plugins: [i18n] } });

      expect(typeof hasTranslationNowFn).toBe("function");
      expect(typeof hasLocaleNowFn).toBe("function");
      expect(hasTranslationNowFn!("hello")).toBe(true);
      expect(hasTranslationNowFn!("missing")).toBe(false);
      expect(hasLocaleNowFn!("en")).toBe(true);
      expect(hasLocaleNowFn!("fr")).toBe(false);
    });

    it("hasTranslationNow respects locale and namespace opts", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ "fr:common": { bonjour: "Bonjour" } });
      await i18n.init();

      expect(i18n.hasTranslationNow("bonjour", { locale: "fr", namespace: "common" })).toBe(true);
      expect(i18n.hasTranslationNow("bonjour", { locale: "en", namespace: "common" })).toBe(false);
    });

    it("hasLocaleNow respects optional namespace parameter", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.addTranslations({ "fr:admin": { title: "Admin" } });
      await i18n.init();

      expect(i18n.hasLocaleNow("fr", "admin")).toBe(true);
      expect(i18n.hasLocaleNow("fr", "common")).toBe(false);
    });
  });

  describe("destroy() cleanup", () => {
    it("should cleanup plugin resources on destroy", async () => {
      const cleanupSpy = vi.fn();
      const i18n = createI18nFromCore(
        createCore({ locale: "en", defaultNs: "common" }).with(attachPlugins),
      );

      i18n.core.use(() => () => cleanupSpy());
      await i18n.init();

      i18n.destroy();

      await vi.waitFor(() => {
        expect(cleanupSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("should be safe to call destroy multiple times", async () => {
      const cleanupSpy = vi.fn();
      const i18n = createI18nFromCore(createCore({ locale: "en" }).with(attachPlugins));
      i18n.core.use(() => () => cleanupSpy());
      await i18n.init();

      i18n.destroy();
      i18n.destroy();
      i18n.destroy();

      await vi.waitFor(() => {
        expect(cleanupSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("should unsubscribe from core events after destroy", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      const localeRef = i18n.locale;
      expect(localeRef.value).toBe("en");

      i18n.destroy();

      // The core still processes the change; the ref must not follow it,
      // because destroy() removed the internal "localeChanged" listener.
      await i18n.setLocale("fr").catch(() => {});
      await nextTick();

      expect(localeRef.value).toBe("en");
    });
  });
});
