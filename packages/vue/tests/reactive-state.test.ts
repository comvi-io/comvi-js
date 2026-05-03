import { describe, it, expect, vi } from "vitest";
import { createI18n, useI18n, T } from "../src";
import { watch, computed, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

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
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      const loader = vi.fn(async (_language: string, _namespace: string) => ({
        adminTitle: "Admin Panel",
      }));

      i18n.use((i18n) => {
        i18n.registerLoader(loader);
      });

      await i18n.init();

      const adminTitle = computed(() => i18n.t("adminTitle", { ns: "admin" }));

      expect(adminTitle.value).toBe("adminTitle"); // Not loaded yet

      // Load admin namespace
      await i18n.addActiveNamespace("admin");
      await nextTick();

      expect(adminTitle.value).toBe("Admin Panel");
    });

    it("should react when translations are reloaded", async () => {
      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      let currentTranslations = { hello: "Hello" };
      const loader = vi.fn(async () => currentTranslations);

      i18n.use((i18n) => {
        i18n.registerLoader(loader);
      });

      await i18n.init();

      const greeting = computed(() => i18n.t("hello"));
      expect(greeting.value).toBe("Hello");

      currentTranslations = { hello: "Hi" };
      await i18n.reloadTranslations("en", "common");
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
      const i18n = createI18n({
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

      i18n.use((i18n) => {
        i18n.registerLoader(loader);
      });

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

      const loadPromise = i18n.addActiveNamespace("admin");
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

      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      i18n.use((i18n) => {
        i18n.registerLoader(loader);
      });

      await i18n.init();

      // Load admin namespace
      await i18n.addActiveNamespace("admin");

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

      const i18n = createI18n({
        locale: "en",
        defaultNs: "common",
      });

      i18n.use((i18n) => {
        i18n.registerLoader(loader);
      });

      const errorSpy = vi.fn();
      i18n.use((i18n) => {
        i18n.onLoadError(errorSpy);
      });

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
});
