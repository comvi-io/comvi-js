import { describe, it, expect } from "vitest";
import { createRoot, createEffect } from "solid-js";
import { attachLoader, createI18n } from "../src/index";
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
    // The only host in this file that needs a capability: the loading signals
    // are driven by a real loader, which the base host does not have.
    const i18n = createI18n({ locale: "en", defaultNs: "common" }).with(attachLoader);
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

  it("cacheRevision signal updates when configChanged is emitted (e.g. setFallbackLocale)", async () => {
    const i18n = createI18n({ locale: "en" });

    await createRoot(async (dispose) => {
      const cacheRevision = createCacheRevisionSignal(i18n);
      createEffect(() => cacheRevision());

      const before = cacheRevision();
      i18n.setFallbackLocale("fr");
      const after = cacheRevision();

      expect(after).toBeGreaterThan(before);
      dispose();
    });
  });

  it("cacheRevision signal is strictly monotonic across all tracked event types (no dropped update from sum collision)", async () => {
    // Pins the dropped re-render a summed `cacheRevision + configRevision`
    // used to cause: `addTranslations` set 1+0, `setFallbackLocale` set 1+1,
    // and then `initialized` re-read the unchanged cache and set 1+1 AGAIN —
    // the same value, so `from()`'s equality check swallowed the notification.
    // A single monotonic `++revision` strictly increases on every event.
    //
    // Signal reads between events are synchronous and accurate (only effects
    // wait for the next microtask), so each step asserts on a direct read.

    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    await createRoot(async (dispose) => {
      const cacheRevision = createCacheRevisionSignal(i18n);

      const v0 = cacheRevision();

      // "namespaceLoaded"
      i18n.addTranslations({ en: { hello: "Hello" } });
      const v1 = cacheRevision();
      expect(v1).toBeGreaterThan(v0);

      // "configChanged"
      i18n.setFallbackLocale("fr");
      const v2 = cacheRevision();
      expect(v2).toBeGreaterThan(v1);

      // "initialized" with no loader: the cache does not change, which is the
      // step the old sum scheme collided on.
      await i18n.init();
      const v3 = cacheRevision();
      expect(v3).toBeGreaterThan(v2);

      // "defaultNamespaceChanged"
      i18n.setDefaultNamespace("admin");
      const v4 = cacheRevision();
      expect(v4).toBeGreaterThan(v3);

      // "translationsCleared"
      i18n.clearTranslations();
      const v5 = cacheRevision();
      expect(v5).toBeGreaterThan(v4);

      dispose();
    });
  });
});
