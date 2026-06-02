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
    // Regression for M4: the old implementation used `cacheRevision + configRevision`
    // where `configRevision` was a local counter and `cacheRevision` was re-read from
    // translationCache.getRevision(). When a cache-unrelated event (e.g. `initialized`)
    // fired via syncCacheRevision() without a cache change, it re-read the same
    // translationCache revision that `bumpConfigRevision` had already snapshotted,
    // producing an identical sum — so Solid's `from()` equality check suppressed the
    // notification and the re-render was silently dropped.
    //
    // Concrete collision:
    //   1. addTranslations → cache._revision=1, configRevision=0 → signal set(1+0=1)
    //   2. setFallbackLocale → configChanged → bumpConfigRevision re-reads cache=1,
    //      configRevision→1 → signal set(1+1=2)
    //   3. i18n.init() → "initialized" → syncCacheRevision re-reads cache=1 (no loader,
    //      no namespace loaded, cache unchanged) → signal set(1+1=2) ← SAME VALUE
    //      → from() equality check drops the notification → re-render NEVER fires.
    //
    // The fix uses a single monotonic `++revision` counter for every event, so the
    // signal value strictly increases regardless of which event fires.
    //
    // Note: Solid batches synchronous signal writes and only flushes effects on the
    // next microtask. Signal reads between events are always synchronous and accurate,
    // so we read the signal value directly after each operation rather than collecting
    // values in an effect.

    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    await createRoot(async (dispose) => {
      const cacheRevision = createCacheRevisionSignal(i18n);

      const v0 = cacheRevision();

      // Step 1: addTranslations fires "namespaceLoaded" — always bumps signal.
      i18n.addTranslations({ en: { hello: "Hello" } });
      const v1 = cacheRevision();
      expect(v1).toBeGreaterThan(v0);

      // Step 2: setFallbackLocale fires "configChanged" — always bumps signal.
      i18n.setFallbackLocale("fr");
      const v2 = cacheRevision();
      expect(v2).toBeGreaterThan(v1);

      // Step 3: init() with no loader fires "initialized" without changing the
      // translation cache. Under the old sum scheme, syncCacheRevision() would
      // re-read cache._revision=1 (unchanged) and produce sum=1+1=2, identical to
      // the value already in the signal — so from() would suppress the notification
      // and the re-render would be silently dropped.
      // Under the fix, ++revision always produces a strictly greater value.
      await i18n.init();
      const v3 = cacheRevision();
      expect(v3).toBeGreaterThan(v2);

      // Step 4: setDefaultNamespace fires "defaultNamespaceChanged" — bumps signal.
      i18n.setDefaultNamespace("admin");
      const v4 = cacheRevision();
      expect(v4).toBeGreaterThan(v3);

      // Step 5: clearTranslations fires "translationsCleared" — bumps signal.
      i18n.clearTranslations();
      const v5 = cacheRevision();
      expect(v5).toBeGreaterThan(v4);

      dispose();
    });
  });
});
