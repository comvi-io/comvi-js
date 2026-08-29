import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createI18n } from "../src/index";
import {
  createLocaleStore,
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
    const language = createLocaleStore(fake.asI18n());
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

    expect(initializingValues).toEqual([false, true, false]);
    expect(get(initializing)).toBe(false);
    expect(get(initialized)).toBe(true);

    await i18n.destroy();

    expect(get(initialized)).toBe(false);

    unsubscribeInitializing();
  });

  it("tracks cache revisions as translations are added and cleared", () => {
    const cacheRevision = createCacheRevisionStore(fake.asI18n());
    // A persistent subscriber keeps the store's monotonic counter alive: a
    // bare get() creates a transient subscription that resets it each call.
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
    const language = createLocaleStore(fake.asI18n());
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

  // `setFallbackLocale` is the production caller; the event is emitted directly
  // here so the store's reaction is tested without the setter in the way.
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
    // A fresh FakeI18n, so the revision counter starts at 0 rather than
    // carrying the addTranslations() the beforeEach instance has already seen.
    const fresh = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fresh.addTranslations({ en: { hello: "Hello" }, fr: { hello: "Bonjour" } });

    const cacheRevision = createCacheRevisionStore(fresh.asI18n());
    const values: number[] = [];
    const unsubscribe = cacheRevision.subscribe((v) => values.push(v));

    // namespaceLoaded — cache change
    fresh.emit("namespaceLoaded", { namespace: "common", locale: "en" });

    // configChanged — config-only, no cache change: the step the old
    // sum-based counter could collide with the one above and drop.
    fresh.emit("configChanged", { source: "fallbackLocale" });

    // translationsCleared — cache change
    fresh.emit("translationsCleared", { locale: "en", namespace: "common" });

    // defaultNamespaceChanged — config change
    fresh.emit("defaultNamespaceChanged", { from: "common", to: "admin" });

    // configChanged again — two consecutive config-only events must not
    // collide either.
    fresh.emit("configChanged", { source: "translationsAdded" });

    // initialized
    fresh.emit("initialized", undefined);

    unsubscribe();

    // The whole sequence, so a failure names the step that stalled rather than
    // just "index i is not greater than i-1": initial + one per event.
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
