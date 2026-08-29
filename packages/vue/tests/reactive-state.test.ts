import { describe, it, expect, vi } from "vitest";
import { attachLoader, createCore, createI18n, createI18nFromCore, useI18n, T } from "../src";
import type { I18nOptions } from "../src";
import { watch, computed, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// The loader is a capability, not part of the base host vue's preset builds.
// Every case below that registers a loader, activates a namespace or reloads
// composes it explicitly — including the "no loader registered" case, which
// needs the capability present precisely to show it works without a loader fn.
const createLoaderI18n = (options: I18nOptions) =>
  createI18nFromCore(createCore(options).with(attachLoader));

describe("Reactive State Transitions", () => {
  describe("Language Reactivity", () => {
    it("should trigger reactivity when locale changes", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      const watchSpy = vi.fn();
      watch(i18n.locale, watchSpy);

      // Change locale
      i18n.locale = "fr";
      await nextTick();

      expect(watchSpy).toHaveBeenCalledWith("fr", "en", expect.anything());
    });

    it("should update computed properties when locale changes", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      const greeting = computed(() => i18n.t("hello"));

      expect(greeting.value).toBe("Hello");

      // Change locale
      i18n.locale = "fr";
      await nextTick();

      expect(greeting.value).toBe("Bonjour");
    });
  });

  describe("Translation Cache Reactivity", () => {
    it("should react to add, update, and clear translations", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      const greeting = computed(() => i18n.t("hello"));
      expect(greeting.value).toBe("hello"); // Missing key

      // Add translation
      i18n.addTranslations({
        en: { hello: "Hello" },
      });

      await nextTick();

      expect(greeting.value).toBe("Hello");

      // Update translation
      i18n.addTranslations({
        en: { hello: "Hi" },
      });

      await nextTick();

      expect(greeting.value).toBe("Hi");

      // Clear translations
      i18n.clearTranslations("en", "common");
      await nextTick();

      expect(greeting.value).toBe("hello");
    });

    it("should react when namespace is loaded", async () => {
      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      const loader = vi.fn(async (_language: string, _namespace: string) => ({
        adminTitle: "Admin Panel",
      }));

      i18n.core.registerLoader(loader);

      await i18n.init();

      const adminTitle = computed(() => i18n.t("adminTitle", { ns: "admin" }));

      expect(adminTitle.value).toBe("adminTitle"); // Not loaded yet

      // Load admin namespace
      await i18n.core.addActiveNamespace("admin");
      await nextTick();

      expect(adminTitle.value).toBe("Admin Panel");
    });

    it("should react when translations are reloaded", async () => {
      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      let currentTranslations = { hello: "Hello" };
      const loader = vi.fn(async () => currentTranslations);

      i18n.core.registerLoader(loader);

      await i18n.init();

      const greeting = computed(() => i18n.t("hello"));
      expect(greeting.value).toBe("Hello");

      currentTranslations = { hello: "Hi" };
      await i18n.core.reloadTranslations("en", "common");
      await nextTick();

      expect(greeting.value).toBe("Hi");
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe("Component Reactivity", () => {
    it("should update useI18n and T components on locale change", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({
        en: { hello: "Hello", goodbye: "Goodbye" },
        fr: { hello: "Bonjour", goodbye: "Au revoir" },
      });

      const UseI18nComponent = defineComponent({
        setup() {
          const { t } = useI18n();
          return { t };
        },
        template: '<div>{{ t("hello") }}</div>',
      });

      const TComponent = defineComponent({
        setup() {
          return () => h(T, { i18nKey: "goodbye" });
        },
      });

      const wrapper1 = mount(UseI18nComponent, {
        global: { plugins: [i18n] },
      });
      const wrapper2 = mount(TComponent, {
        global: { plugins: [i18n] },
      });

      expect(wrapper1.text()).toBe("Hello");
      expect(wrapper2.text()).toBe("Goodbye");

      await i18n.setLocale("fr");
      await nextTick();

      expect(wrapper1.text()).toBe("Bonjour");
      expect(wrapper2.text()).toBe("Au revoir");
    });
  });

  describe("Loading State Reactivity", () => {
    it("should react to loading state in components", async () => {
      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      const adminDeferred = createDeferred<Record<string, string>>();
      const loader = vi.fn(async (_language: string, namespace: string) => {
        if (namespace === "admin") {
          return adminDeferred.promise;
        }
        return { hello: "Hello" };
      });

      i18n.core.registerLoader(loader);

      const TestComponent = defineComponent({
        setup() {
          const { isLoading } = useI18n();
          return { isLoading };
        },
        template: '<div>{{ isLoading ? "Loading..." : "Ready" }}</div>',
      });

      const wrapper = mount(TestComponent, {
        global: { plugins: [i18n] },
      });

      // Note: install() auto-calls init(), so isLoading is initially true
      // Wait for init to complete first
      await vi.waitFor(() => {
        expect(i18n.isLoading.value).toBe(false);
      });

      expect(wrapper.text()).toBe("Ready");

      const loadPromise = i18n.core.addActiveNamespace("admin");
      await nextTick();

      expect(wrapper.text()).toBe("Loading...");

      adminDeferred.resolve({ title: "Title" });
      await loadPromise;
      await nextTick();

      expect(wrapper.text()).toBe("Ready");
    });
  });

  describe("Namespace Reload on Locale Change", () => {
    it("should reload active namespaces when locale changes", async () => {
      const loader = vi.fn(async (locale: string, namespace: string) => {
        const translations: Record<string, Record<string, string>> = {
          "en:common": { hello: "Hello" },
          "en:admin": { title: "Admin" },
          "fr:common": { hello: "Bonjour" },
          "fr:admin": { title: "Administrateur" },
        };
        return translations[`${locale}:${namespace}`] || {};
      });

      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      i18n.core.registerLoader(loader);

      await i18n.init();

      // Load admin namespace
      await i18n.core.addActiveNamespace("admin");

      expect(loader).toHaveBeenCalledWith("en", "common");
      expect(loader).toHaveBeenCalledWith("en", "admin");

      loader.mockClear();

      // Change locale - should reload both namespaces
      i18n.locale = "fr";
      await nextTick();

      // Wait for loaders to complete and reactivity to trigger
      await vi.waitFor(() => {
        expect(loader).toHaveBeenCalledWith("fr", "common");
        expect(loader).toHaveBeenCalledWith("fr", "admin");
        expect(i18n.t("hello")).toBe("Bonjour");
        expect(i18n.t("title", { ns: "admin" })).toBe("Administrateur");
      });
    });

    it("should handle errors during namespace reload", async () => {
      const loader = vi.fn(async (locale: string, _namespace: string) => {
        if (locale === "fr") {
          throw new Error("Load failed");
        }
        return { hello: "Hello" };
      });

      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      i18n.core.registerLoader(loader);

      const errorSpy = vi.fn();
      i18n.core.onLoadError(errorSpy);

      await i18n.init();

      expect(i18n.t("hello")).toBe("Hello");

      // Switch to French - should fail (catch to avoid console.error from setter)
      await i18n.setLocale("fr").catch(() => {});

      // Wait for error with specific arguments
      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith("fr", "common", expect.any(Error));
      });
    });
  });

  describe("loadedLocales Reactivity", () => {
    it("should update loadedLocales when translations are added", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      expect(i18n.loadedLocales.value).not.toContain("fr");

      i18n.addTranslations({ fr: { hello: "Bonjour" } });
      await nextTick();

      expect(i18n.loadedLocales.value).toContain("fr");
    });

    it("should update loadedLocales when a namespace is loaded via loader", async () => {
      const loader = vi.fn(async (locale: string) => ({
        [`hello_${locale}`]: `Hello in ${locale}`,
      }));

      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      i18n.core.registerLoader(loader);

      await i18n.init();

      expect(i18n.loadedLocales.value).toContain("en");

      await i18n.core.addActiveNamespace("admin");
      await nextTick();

      expect(i18n.loadedLocales.value).toContain("en");
    });
  });

  describe("activeNamespaces Reactivity", () => {
    it("should update activeNamespaces after addActiveNamespace", async () => {
      const loader = vi.fn(async () => ({ title: "Admin" }));

      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      i18n.core.registerLoader(loader);

      await i18n.init();

      expect(i18n.activeNamespaces.value).not.toContain("admin");

      await i18n.core.addActiveNamespace("admin");
      await nextTick();

      expect(i18n.activeNamespaces.value).toContain("admin");
    });

    it("should include defaultNs in activeNamespaces from the start", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      expect(i18n.activeNamespaces.value).toContain("common");
    });
  });

  describe("hasTranslation Reactivity", () => {
    it("should reactively update when a translation is added", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      const has = i18n.hasTranslation("greeting");
      expect(has.value).toBe(false);

      i18n.addTranslations({ en: { greeting: "Hello" } });
      await nextTick();

      expect(has.value).toBe(true);
    });

    it("should return false after translations are cleared", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({ en: { greeting: "Hello" } });
      await nextTick();

      const has = i18n.hasTranslation("greeting");
      expect(has.value).toBe(true);

      i18n.clearTranslations("en", "common");
      await nextTick();

      expect(has.value).toBe(false);
    });
  });

  describe("hasLocale Reactivity", () => {
    it("should reactively update when a locale is added", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      const isUk = i18n.hasLocale("uk");
      expect(isUk.value).toBe(false);

      i18n.addTranslations({ uk: { hello: "Привіт" } });
      await nextTick();

      expect(isUk.value).toBe(true);
    });

    it("should return false after locale translations are cleared", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({ fr: { hello: "Bonjour" } });
      await nextTick();

      const isFr = i18n.hasLocale("fr");
      expect(isFr.value).toBe(true);

      i18n.clearTranslations("fr", "common");
      await nextTick();

      expect(isFr.value).toBe(false);
    });
  });

  describe("Locale Setter Error Path", () => {
    it("should route error to reportError (onError) and not call console.error", async () => {
      const onError = vi.fn();
      const loader = vi.fn(async (locale: string) => {
        if (locale === "badlocale") {
          throw new Error("locale load failed");
        }
        return { hello: "Hello" };
      });

      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
        onError,
      });

      i18n.core.registerLoader(loader);

      await i18n.init();

      const consoleErr = vi.spyOn(console, "error");

      i18n.locale = "badlocale";
      await flushPromises();

      // Error must be routed through user's onError handler (not console.error).
      // The exact `source` may be "namespace-load" (reported by core during
      // namespace-loading failure) or "setLocale" (reported by VueI18n's catch
      // wrapper); both are valid — what matters is no leak to console.
      expect(onError).toHaveBeenCalled();
      expect(consoleErr).not.toHaveBeenCalled();

      consoleErr.mockRestore();
    });
  });

  describe("setFallbackLocale + checkFallbacks reactivity", () => {
    it("should update hasTranslation with checkFallbacks after setFallbackLocale", async () => {
      const i18n = createI18n({
        locale: "fr",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({ en: { foo: "bar" } });

      const hasFoo = i18n.hasTranslation("foo", { checkFallbacks: true });
      expect(hasFoo.value).toBe(false);

      i18n.setFallbackLocale("en");
      await nextTick();

      expect(hasFoo.value).toBe(true);
    });

    it("should update computed translations after setFallbackLocale", async () => {
      const i18n = createI18n({
        locale: "fr",
        defaultNs: "common",
      });

      await i18n.init();

      i18n.addTranslations({ en: { foo: "bar" } });

      const fallbackText = computed(() => i18n.t("foo"));
      expect(fallbackText.value).toBe("foo");

      i18n.setFallbackLocale("en");
      await nextTick();

      expect(fallbackText.value).toBe("bar");
    });
  });

  describe("addTranslations programmatic reactivity", () => {
    it("should update t() result after addTranslations", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      expect(i18n.t("foo")).toBe("foo");

      i18n.addTranslations({ en: { foo: "bar" } });
      await nextTick();

      expect(i18n.t("foo")).toBe("bar");
    });
  });

  describe("addActiveNamespace no-loader reactivity", () => {
    it("should include namespace in activeNamespaces without a loader", async () => {
      const i18n = createLoaderI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      expect(i18n.activeNamespaces.value).not.toContain("admin");

      await i18n.core.addActiveNamespace("admin");
      await nextTick();

      expect(i18n.activeNamespaces.value).toContain("admin");
    });
  });

  describe("setDefaultNamespace artifact verification", () => {
    it("should update defaultNamespace reactively after setDefaultNamespace", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      expect(i18n.defaultNamespace.value).toBe("common");

      // VueI18n doesn't proxy setDefaultNamespace; drive the host directly
      i18n.core.setDefaultNamespace("admin");
      await nextTick();

      expect(i18n.defaultNamespace.value).toBe("admin");
    });
  });

  describe("translationCache Ref Identity", () => {
    it("should return the same Ref instance across mutations", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      const ref1 = i18n.translationCache;

      i18n.addTranslations({ en: { foo: "bar" } });
      await nextTick();

      expect(i18n.translationCache).toBe(ref1);
      // ref1.value is a ReadonlyMapView (Map-like). Duck-type the API surface.
      expect(typeof ref1.value.has).toBe("function");
      expect(typeof ref1.value.get).toBe("function");
    });

    it("should reflect updated translations in the same Ref after mutation", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      await i18n.init();

      const ref1 = i18n.translationCache;
      expect(ref1.value.has("en:common")).toBe(false);

      i18n.addTranslations({ en: { foo: "bar" } });
      await nextTick();

      expect(ref1.value.has("en:common")).toBe(true);
      expect(i18n.translationCache).toBe(ref1);
    });
  });
});
