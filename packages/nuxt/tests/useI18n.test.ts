import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetMocks, setMockI18n, useState } from "./mocks/nuxt-app";
import { useI18n } from "../src/runtime/composables/useI18n";
import type * as ComviCore from "@comvi/core";

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

// The composable takes `createBoundTranslation` from the SLIM entry: it runs on
// a bare WrapperI18nHost, which is all `$i18n` promises.
vi.mock("@comvi/core", async (importOriginal) => ({
  ...(await importOriginal<typeof ComviCore>()),
  createBoundTranslation,
}));

// The composable is a pass-through map over the WHOLE host surface, so a
// partial stub would hand back `undefined` where the contract promises a member.
function createI18nStub() {
  return {
    locale: ref("en"),
    setLocale: vi.fn(async () => undefined),
    translationCache: computed(() => new Map()),
    isLoading: ref(false),
    isInitializing: ref(false),
    addTranslations: vi.fn(),
    setFallbackLocale: vi.fn(),
    defaultParams: computed(() => ({ formality: "formal" })),
    setDefaultParams: vi.fn(),
    clearTranslations: vi.fn(),
    hasLocale: vi.fn(() => computed(() => true)),
    hasTranslation: vi.fn(() => computed(() => true)),
    loadedLocales: computed(() => ["en"]),
    activeNamespaces: computed(() => ["default"]),
    defaultNamespace: computed(() => "default"),
    on: vi.fn(() => () => undefined),
    reportError: vi.fn(),
    formatNumber: vi.fn(() => "1"),
    formatDate: vi.fn(() => "date"),
    formatCurrency: vi.fn(() => "$1.00"),
    formatRelativeTime: vi.fn(() => "now"),
    dir: computed(() => "ltr" as const),
    destroy: vi.fn(),
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

  it("returns bound API and syncs locale state on setLocale", async () => {
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
    expect(api.locales.value).toEqual(["en", "de", "uk"]);
    expect(api.defaultLocale.value).toBe("en");

    await api.setLocale("de");
    expect(i18n.setLocale).toHaveBeenCalledWith("de");
    expect(useState<string>("i18n-locale").value).toBe("de");
  });

  it("creates bound translation with the correct namespace argument", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    useI18n("dashboard");

    expect(createBoundTranslation).toHaveBeenCalledTimes(1);
    expect(createBoundTranslation).toHaveBeenCalledWith(i18n, "dashboard");
  });

  it("uses undefined namespace when called without arguments", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    useI18n();

    expect(createBoundTranslation).toHaveBeenCalledTimes(1);
    expect(createBoundTranslation).toHaveBeenCalledWith(i18n, undefined);
  });

  it("exposes reactive locale ref from i18n instance", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    const api = useI18n();

    expect(api.locale.value).toBe("en");

    // The ref is shared, not copied.
    i18n.locale.value = "fr";
    expect(api.locale.value).toBe("fr");
  });

  it("delegates core i18n methods to the i18n instance", () => {
    const i18n = createI18nStub();
    setMockI18n(i18n);

    const api = useI18n();

    expect(api.defaultParams.value).toEqual({ formality: "formal" });
    api.setDefaultParams({ formality: "informal" });
    expect(i18n.setDefaultParams).toHaveBeenCalledWith({ formality: "informal" });

    api.addTranslations({ "en:common": { greeting: "Hello" } });
    expect(i18n.addTranslations).toHaveBeenCalledWith({ "en:common": { greeting: "Hello" } });

    expect(api.hasLocale("en", "common").value).toBe(true);
    expect(i18n.hasLocale).toHaveBeenCalledWith("en", "common");

    expect(api.hasTranslation("greeting", { locale: "en", namespace: "common" }).value).toBe(true);
    expect(i18n.hasTranslation).toHaveBeenCalledWith("greeting", {
      locale: "en",
      namespace: "common",
    });

    expect(api.hasTranslation("missing").value).toBe(true);
    expect(i18n.hasTranslation).toHaveBeenCalledWith("missing");

    expect(api.loadedLocales.value).toEqual(["en"]);
    expect(api.activeNamespaces.value).toEqual(["default"]);
    expect(api.defaultNamespace.value).toBe("default");

    const handler = () => {};
    api.on("localeChanged" as any, handler);
    expect(i18n.on).toHaveBeenCalledWith("localeChanged", handler);
  });
});
