import { describe, it, expect } from "vitest";
import { createRoot, createEffect } from "solid-js";
import { createI18n } from "@comvi/core";
import {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "../src/primitives";

describe("Solid primitives", () => {
  it("updates initialized signal when i18n is initialized and destroyed", async () => {
    const i18n = createI18n({ locale: "en" });

    await createRoot(async (dispose) => {
      const isInitialized = createInitializedSignal(i18n);

      expect(isInitialized()).toBe(false);

      await i18n.init();
      expect(isInitialized()).toBe(true);

      await i18n.destroy();
      expect(isInitialized()).toBe(false);

      dispose();
    });
  });

  it("updates locale signal when the active locale changes", async () => {
    const i18n = createI18n({ locale: "en" });

    await createRoot(async (dispose) => {
      const locale = createLocaleSignal(i18n);
      createEffect(() => {
        locale();
      });

      await i18n.setLocaleAsync("fr");

      expect(locale()).toBe("fr");
      dispose();
    });
  });

  it("updates default namespace signal when the default namespace changes", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });

    await createRoot(async (dispose) => {
      const defaultNamespace = createDefaultNamespaceSignal(i18n);

      expect(defaultNamespace()).toBe("common");

      i18n.setDefaultNamespace("admin");
      expect(defaultNamespace()).toBe("admin");

      dispose();
    });
  });

  it("updates loading and initializing signals during initialization work", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });
    let resolveLoader!: (value: Record<string, string>) => void;
    const loaderResult = new Promise<Record<string, string>>((resolve) => {
      resolveLoader = resolve;
    });

    i18n.registerLoader(async () => loaderResult);

    await createRoot(async (dispose) => {
      const isLoading = createLoadingSignal(i18n);
      const isInitializing = createInitializingSignal(i18n);
      createEffect(() => isLoading());
      createEffect(() => isInitializing());

      expect(isLoading()).toBe(false);
      expect(isInitializing()).toBe(false);

      const initPromise = i18n.init();
      await Promise.resolve();

      expect(isLoading()).toBe(true);
      expect(isInitializing()).toBe(true);

      resolveLoader({});
      await initPromise;

      expect(isLoading()).toBe(false);
      expect(isInitializing()).toBe(false);
      dispose();
    });
  });

  it("tracks cache revision changes when translations are added and cleared", () => {
    const i18n = createI18n({ locale: "en" });

    createRoot((dispose) => {
      const cacheRevision = createCacheRevisionSignal(i18n);

      const before = cacheRevision();
      i18n.addTranslations({ en: { hello: "Hello" } });
      const afterAdd = cacheRevision();

      expect(afterAdd).toBeGreaterThan(before);

      i18n.clearTranslations();
      const afterClear = cacheRevision();
      expect(afterClear).toBeGreaterThan(afterAdd);

      dispose();
    });
  });
});
