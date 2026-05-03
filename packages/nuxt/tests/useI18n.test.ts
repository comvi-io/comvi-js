import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRuntimeConfig, resetMocks, setMockI18n, useState } from "./mocks/nuxt-app";
import { useI18n } from "../src/runtime/composables/useI18n";

const { createBoundTranslation, boundT } = vi.hoisted(() => {
  const t = vi.fn(() => [
    "Hello ",
    { type: "element", tag: "strong", props: {}, children: ["Alice"] },
    "!",
  ]);
  return {
    createBoundTranslation: vi.fn(() => t),
    boundT: t,
  };
});

vi.mock("@comvi/core", () => ({
  createBoundTranslation,
}));

function createI18nStub() {
  return {
    locale: ref("en"),
    setLocale: vi.fn(async () => undefined),
    translationCache: computed(() => new Map()),
    isLoading: ref(false),
    isInitializing: ref(false),
    addTranslations: vi.fn(),
    addActiveNamespace: vi.fn(async () => undefined),
    setFallbackLocale: vi.fn(),
    onMissingKey: vi.fn(() => () => undefined),
    onLoadError: vi.fn(() => () => undefined),
    clearTranslations: vi.fn(),
    reloadTranslations: vi.fn(async () => undefined),
    hasLocale: vi.fn(() => true),
    hasTranslation: vi.fn(() => true),
    getLoadedLocales: vi.fn(() => ["en"]),
    getActiveNamespaces: vi.fn(() => ["default"]),
    getDefaultNamespace: vi.fn(() => "default"),
    on: vi.fn(() => () => undefined),
    reportError: vi.fn(),
  };
}

describe("useI18n composable", () => {
  beforeEach(() => {
    resetMocks();
    createBoundTranslation.mockClear();
    boundT.mockClear();
  });

  it("throws when i18n plugin is not initialized", () => {
    expect(() => useI18n()).toThrow(
      "[@comvi/nuxt] i18n not initialized. Make sure @comvi/nuxt module is configured in nuxt.config.ts",
    );
  });

  it("returns bound API and syncs locale state on setLanguage", async () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    const api = useI18n("admin");

    expect(createBoundTranslation).toHaveBeenCalledWith(i18n, "admin");
    expect(api.tRaw).toBe(boundT);
    expect(api.t("rich")).toBe("Hello Alice!");
    expect(api.tRaw("rich")).toEqual([
      "Hello ",
      { type: "element", tag: "strong", props: {}, children: ["Alice"] },
      "!",
    ]);
    expect(api.locales).toEqual(mockRuntimeConfig.public.comvi.locales);
    expect(api.defaultLocale).toBe(mockRuntimeConfig.public.comvi.defaultLocale);

    await api.setLocale("de");
    expect(i18n.setLocale).toHaveBeenCalledWith("de");
    expect(useState<string>("i18n-locale").value).toBe("de");
  });

  it("creates bound translation with the correct namespace argument", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    useI18n("dashboard");

    // createBoundTranslation should be called with the i18n instance and namespace
    expect(createBoundTranslation).toHaveBeenCalledTimes(1);
    expect(createBoundTranslation).toHaveBeenCalledWith(i18n, "dashboard");
  });

  it("uses undefined namespace when called without arguments", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    useI18n();

    // createBoundTranslation called with i18n and undefined (no default ns override)
    expect(createBoundTranslation).toHaveBeenCalledTimes(1);
    expect(createBoundTranslation).toHaveBeenCalledWith(i18n, undefined);
  });

  it("exposes reactive locale ref from i18n instance", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    const api = useI18n();

    // locale should be the same reactive ref from the i18n stub
    expect(api.locale.value).toBe("en");

    // Mutating the source ref should be visible through api.locale
    i18n.locale.value = "fr";
    expect(api.locale.value).toBe("fr");
  });

  it("delegates core i18n methods to the i18n instance", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    const api = useI18n();

    // Call methods through the composable and verify they delegate to the i18n stub
    api.addTranslations({ "en:common": { greeting: "Hello" } });
    expect(i18n.addTranslations).toHaveBeenCalledWith({ "en:common": { greeting: "Hello" } });

    api.hasLocale("en", "common");
    expect(i18n.hasLocale).toHaveBeenCalledWith("en", "common");

    api.hasTranslation("greeting", "en", "common");
    expect(i18n.hasTranslation).toHaveBeenCalledWith("greeting", "en", "common");

    api.hasTranslation("missing");
    expect(i18n.hasTranslation).toHaveBeenCalledWith("missing");

    const handler = () => {};
    api.on("localeChanged" as any, handler);
    expect(i18n.on).toHaveBeenCalledWith("localeChanged", handler);
  });
});
