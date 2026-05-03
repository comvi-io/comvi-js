import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../src";
import { nextTick } from "vue";

describe("New Features", () => {
  describe("Cached translationCache computed", () => {
    it("should update cache ref when translations are added", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      const cache = i18n.translationCache;

      // Initially no translations loaded
      expect(cache.value.size).toBe(0);

      i18n.addTranslations({
        en: { hello: "Hello", goodbye: "Bye" },
      });

      await nextTick();

      // Cache should contain exactly the translations we added
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

      // Wait for async setLocale to complete
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

      // Unsubscribe
      unsubscribe();

      // Change locale again
      i18n.locale = "de";
      await vi.waitFor(() => {
        expect(i18n.locale.value).toBe("de");
      });

      // Should still be 1 (not called again)
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should subscribe to missingKey event", async () => {
      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      await i18n.init();

      const spy = vi.fn();
      i18n.on("missingKey", spy);

      // Access missing key
      i18n.t("nonexistent.key");

      expect(spy).toHaveBeenCalledWith({
        key: "nonexistent.key",
        locale: "en",
        namespace: "common",
      });
    });

    it("should subscribe to namespaceLoaded event", async () => {
      const loader = vi.fn(async () => ({ title: "Title" }));

      const i18n = createI18n({ locale: "en", defaultNs: "common" });
      i18n.use((i18n) => i18n.registerLoader(loader));
      await i18n.init();

      const spy = vi.fn();
      i18n.on("namespaceLoaded", spy);

      await i18n.addActiveNamespace("admin");

      expect(spy).toHaveBeenCalledWith({
        namespace: "admin",
        locale: "en",
      });
    });
  });

  describe("SSR support (ssrLanguage option)", () => {
    it("should use ssrLanguage for initial locale state to prevent hydration mismatch", () => {
      // When the server detects a locale (e.g., "fr"), ssrLanguage ensures
      // the client-side Vue ref matches the server-rendered HTML, preventing
      // hydration warnings like "Text content does not match server-rendered HTML"
      const i18n = createI18n({
        locale: "en",
        ssrLanguage: "fr",
      });

      // Vue ref should have ssrLanguage value
      expect(i18n.locale.value).toBe("fr");
    });

    it("should use regular locale when ssrLanguage is not provided", () => {
      const i18n = createI18n({
        locale: "en",
      });

      expect(i18n.locale.value).toBe("en");
    });

    it("should use ssrLanguage as core locale before and after initialization", async () => {
      const i18n = createI18n({
        locale: "en",
        ssrLanguage: "fr",
        defaultNs: "common",
      });

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      // SSR locale should drive translations immediately (before init)
      expect(i18n.t("hello")).toBe("Bonjour");
      expect(i18n.locale.value).toBe("fr");

      await i18n.init();

      // Without a detector override, ssrLanguage remains the active locale
      expect(i18n.locale.value).toBe("fr");
      expect(i18n.t("hello")).toBe("Bonjour");
    });

    it("should keep ssrLanguage when it matches the core locale after init", async () => {
      const i18n = createI18n({
        locale: "fr",
        ssrLanguage: "fr",
        defaultNs: "common",
      });

      i18n.addTranslations({
        fr: { hello: "Bonjour" },
      });

      // Before init, ssrLanguage matches
      expect(i18n.locale.value).toBe("fr");

      await i18n.init();

      // After init, locale should remain "fr" since ssrLanguage matches core locale
      expect(i18n.locale.value).toBe("fr");
    });
  });

  describe("destroy() cleanup", () => {
    it("should cleanup plugin resources on destroy", async () => {
      const cleanupSpy = vi.fn();
      const i18n = createI18n({ locale: "en", defaultNs: "common" });

      i18n.use(() => () => cleanupSpy());
      await i18n.init();

      i18n.destroy();

      await vi.waitFor(() => {
        expect(cleanupSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("should be safe to call destroy multiple times", async () => {
      const cleanupSpy = vi.fn();
      const i18n = createI18n({ locale: "en" });
      i18n.use(() => () => cleanupSpy());
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

      // Record the locale ref value before destroy
      const localeRef = i18n.locale;
      expect(localeRef.value).toBe("en");

      // Destroy should unsubscribe all internal event listeners
      i18n.destroy();

      // Attempt to change the locale after destroy
      // The core still processes it, but the Vue ref should NOT update
      // because the internal "localeChanged" listener was removed
      await i18n.setLocale("fr").catch(() => {});
      await nextTick();

      // The locale ref should remain "en" since the internal
      // event subscription was cleaned up by destroy
      expect(localeRef.value).toBe("en");
    });
  });
});
