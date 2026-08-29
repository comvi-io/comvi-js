import { describe, it, expect, vi } from "vitest";
import { createRoot } from "solid-js";
import { attachLoader, createI18n } from "../src/index";
import {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "../src/primitives";
import { createTestRoot } from "./test-utils";

// `from()` runs its producer — and therefore subscribes — the moment the signal
// is created, so none of these signals needs a `createEffect` subscriber to
// receive updates; a direct read is accurate between events.

describe("Solid primitives", () => {
  it("updates initialized signal when i18n is initialized and destroyed", async () => {
    const i18n = createI18n({ locale: "en" });

    const isInitialized = createTestRoot(() => createInitializedSignal(i18n));

    expect(isInitialized()).toBe(false);

    await i18n.init();
    expect(isInitialized()).toBe(true);

    await i18n.destroy();
    expect(isInitialized()).toBe(false);
  });

  it("updates locale signal when the active locale changes", async () => {
    const i18n = createI18n({ locale: "en" });

    const locale = createTestRoot(() => createLocaleSignal(i18n));

    await i18n.setLocaleAsync("fr");

    expect(locale()).toBe("fr");
  });

  it("updates default namespace signal when the default namespace changes", () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });

    const defaultNamespace = createTestRoot(() => createDefaultNamespaceSignal(i18n));

    expect(defaultNamespace()).toBe("common");

    i18n.setDefaultNamespace("admin");

    expect(defaultNamespace()).toBe("admin");
  });

  it("stops updating a signal once its reactive root is disposed", async () => {
    const i18n = createI18n({ locale: "en" });

    const { locale, dispose } = createRoot((disposeRoot) => ({
      locale: createLocaleSignal(i18n),
      dispose: disposeRoot,
    }));

    await i18n.setLocaleAsync("fr");
    expect(locale()).toBe("fr");

    dispose();
    await i18n.setLocaleAsync("de");

    expect(locale()).toBe("fr");
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

    const { isLoading, isInitializing } = createTestRoot(() => ({
      isLoading: createLoadingSignal(i18n),
      isInitializing: createInitializingSignal(i18n),
    }));

    expect(isLoading()).toBe(false);
    expect(isInitializing()).toBe(false);

    const initPromise = i18n.init();
    await vi.waitFor(() => {
      expect(isLoading()).toBe(true);
    });
    expect(isInitializing()).toBe(true);

    resolveLoader({});
    await initPromise;

    expect(isLoading()).toBe(false);
    expect(isInitializing()).toBe(false);
  });

  it("tracks cache revision changes when translations are added and cleared", () => {
    const i18n = createI18n({ locale: "en" });

    const cacheRevision = createTestRoot(() => createCacheRevisionSignal(i18n));

    const before = cacheRevision();
    i18n.addTranslations({ en: { hello: "Hello" } });
    const afterAdd = cacheRevision();

    expect(afterAdd).toBeGreaterThan(before);

    i18n.clearTranslations();
    const afterClear = cacheRevision();
    expect(afterClear).toBeGreaterThan(afterAdd);
  });

  it("cacheRevision signal updates when configChanged is emitted (e.g. setFallbackLocale)", () => {
    const i18n = createI18n({ locale: "en" });

    const cacheRevision = createTestRoot(() => createCacheRevisionSignal(i18n));

    const before = cacheRevision();
    i18n.setFallbackLocale("fr");
    const after = cacheRevision();

    expect(after).toBeGreaterThan(before);
  });

  it("cacheRevision signal is strictly monotonic across all tracked event types (no dropped update from sum collision)", async () => {
    // Pins the dropped re-render a summed `cacheRevision + configRevision`
    // used to cause: `addTranslations` set 1+0, `setFallbackLocale` set 1+1,
    // and then `initialized` re-read the unchanged cache and set 1+1 AGAIN —
    // the same value, so `from()`'s equality check swallowed the notification.
    // A single monotonic `++revision` strictly increases on every event.

    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    const cacheRevision = createTestRoot(() => createCacheRevisionSignal(i18n));

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
  });
});
