import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createI18n } from "@comvi/core";
import {
  createLocaleStore,
  createLanguageStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
} from "../src/stores";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("Svelte stores", () => {
  let fake: FakeI18n;

  beforeEach(() => {
    fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({
      en: { hello: "Hello" },
      fr: { hello: "Bonjour" },
    });
  });

  it("reflects the current language and updates when it changes", async () => {
    const language = createLanguageStore(fake.asI18n());
    const values: string[] = [];
    const unsubscribe = language.subscribe((value) => values.push(value));

    expect(get(language)).toBe("en");

    await fake.setLanguageAsync("fr");

    expect(get(language)).toBe("fr");
    expect(values).toEqual(["en", "fr"]);

    unsubscribe();
  });

  it("reflects loading while a namespace is being added", async () => {
    const loading = createLoadingStore(fake.asI18n());
    const values: boolean[] = [];
    const unsubscribe = loading.subscribe((value) => values.push(value));
    let resolveLoad: (() => void) | undefined;

    fake.namespaceLoadResult = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });

    const pendingNamespace = fake.addActiveNamespace("admin");

    expect(get(loading)).toBe(true);
    expect(values).toEqual([false, true]);

    resolveLoad?.();
    await pendingNamespace;

    expect(get(loading)).toBe(false);
    expect(values).toEqual([false, true, false]);

    unsubscribe();
  });

  it("tracks initialization and reset on destroy", async () => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        en: { hello: "Hello" },
      },
    });

    const initializing = createInitializingStore(i18n);
    const initialized = createInitializedStore(i18n);
    const initializingValues: boolean[] = [];
    const unsubscribeInitializing = initializing.subscribe((value) => {
      initializingValues.push(value);
    });

    const pendingInit = i18n.init();

    expect(get(initializing)).toBe(true);
    expect(get(initialized)).toBe(false);

    await pendingInit;

    expect(initializingValues).toContain(true);
    expect(get(initializing)).toBe(false);
    expect(get(initialized)).toBe(true);

    await i18n.destroy();

    expect(get(initialized)).toBe(false);

    unsubscribeInitializing();
  });

  it("tracks cache revisions as translations are added and cleared", () => {
    const cacheRevision = createCacheRevisionStore(fake.asI18n());
    // Use a persistent subscriber so the store's internal monotonic counter
    // stays alive between events (bare get() creates a transient subscription
    // that resets the counter each call).
    const values: number[] = [];
    const unsubscribe = cacheRevision.subscribe((v) => values.push(v));
    const before = values.at(-1)!;

    fake.addTranslations({ en: { welcome: "Welcome" } });
    const afterAdd = values.at(-1)!;
    fake.clearTranslations("en", "common");
    const afterClear = values.at(-1)!;

    expect(afterAdd).toBeGreaterThan(before);
    expect(afterClear).toBeGreaterThan(afterAdd);

    unsubscribe();
  });

  it("gives new subscribers the latest value", async () => {
    const language = createLanguageStore(fake.asI18n());
    const values1: string[] = [];
    const unsubscribe1 = language.subscribe((value) => values1.push(value));

    expect(values1).toEqual(["en"]);
    unsubscribe1();

    await fake.setLanguageAsync("fr");

    const values2: string[] = [];
    const unsubscribe2 = language.subscribe((value) => values2.push(value));

    expect(get(language)).toBe("fr");
    expect(values2).toEqual(["fr"]);

    unsubscribe2();
  });

  it("createLocaleStore and createLanguageStore are the same store (deprecated alias)", () => {
    const i18n = fake.asI18n();
    expect(createLocaleStore(i18n)).toBe(createLanguageStore(i18n));
  });

  it("cacheRevision store updates when configChanged is emitted (e.g. setFallbackLocale)", () => {
    const cacheRevision = createCacheRevisionStore(fake.asI18n());
    const values: number[] = [];
    const unsubscribe = cacheRevision.subscribe((value) => values.push(value));
    const before = values.at(-1) ?? Number.NEGATIVE_INFINITY;

    fake.emit("configChanged", { source: "fallbackLocale" });
    const after = values.at(-1) ?? Number.NEGATIVE_INFINITY;

    expect(after).toBeGreaterThan(before);
    unsubscribe();
  });

  it("cacheRevision is strictly monotonic across all tracked events — no dropped updates", () => {
    // Use a fresh FakeI18n so the store's internal revision counter starts at 0
    // and is not shared with the memoized instance from beforeEach.
    const fresh = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fresh.addTranslations({ en: { hello: "Hello" }, fr: { hello: "Bonjour" } });

    const cacheRevision = createCacheRevisionStore(fresh.asI18n());
    const values: number[] = [];
    const unsubscribe = cacheRevision.subscribe((v) => values.push(v));

    // 1. namespaceLoaded — translation cache changed
    fresh.emit("namespaceLoaded", { namespace: "common", locale: "en" });

    // 2. configChanged (fallbackLocale) — config-only change, no cache change.
    //    Under the old sum-based counter this could collide with step 1 and be
    //    dropped; the monotonic counter guarantees a bump.
    fresh.emit("configChanged", { source: "fallbackLocale" });

    // 3. translationsCleared — cache change
    fresh.emit("translationsCleared", { locale: "en", namespace: "common" });

    // 4. defaultNamespaceChanged — config change
    fresh.emit("defaultNamespaceChanged", { from: "common", to: "admin" });

    // 5. configChanged (translationsAdded) — second config-only change in a row.
    //    Two consecutive config events must also never collide.
    fresh.emit("configChanged", { source: "translationsAdded" });

    // 6. initialized — initialization complete
    fresh.emit("initialized", undefined);

    unsubscribe();

    // We should have received the initial value + one notification per event.
    expect(values.length).toBe(7); // initial + 6 events

    // Every successive value must be strictly greater than the one before it.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
