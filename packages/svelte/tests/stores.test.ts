import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createI18n } from "../src/index";
import {
  createLocaleStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
  createDefaultParamsStore,
} from "../src/stores";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import type { I18n } from "@comvi/core";

const memoizedStoreFactories: ReadonlyArray<readonly [string, (i18n: I18n) => unknown]> = [
  ["createLocaleStore", createLocaleStore],
  ["createLoadingStore", createLoadingStore],
  ["createInitializingStore", createInitializingStore],
  ["createInitializedStore", createInitializedStore],
  ["createCacheRevisionStore", createCacheRevisionStore],
  ["createDefaultParamsStore", createDefaultParamsStore],
];

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
    // A persistent subscriber, so the assertions below read what the store
    // PUSHED. A bare get() on an unsubscribed store re-runs the start function
    // and re-syncs from the host, which passes even if no event is tracked.
    const initializedValues: boolean[] = [];
    const unsubscribeInitialized = initialized.subscribe((value) => {
      initializedValues.push(value);
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
    expect(initializedValues).toEqual([false, true, false]);

    unsubscribeInitializing();
    unsubscribeInitialized();
  });

  it("removes both host listeners when the last subscriber unsubscribes", () => {
    const initialized = createInitializedStore(fake.asI18n());
    const unsubscribe = initialized.subscribe(() => {});
    const whileSubscribed = [
      fake.listenerCount("initialized"),
      fake.listenerCount("destroyed"),
    ] as const;

    unsubscribe();

    expect(whileSubscribed).toEqual([1, 1]);
    expect([fake.listenerCount("initialized"), fake.listenerCount("destroyed")]).toEqual([0, 0]);
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

  it("gives a new loading subscriber the host's current state, not the one captured at creation", async () => {
    const loading = createLoadingStore(fake.asI18n());
    let resolveLoad: (() => void) | undefined;
    fake.namespaceLoadResult = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const pendingNamespace = fake.addActiveNamespace("admin");

    const values: boolean[] = [];
    const unsubscribe = loading.subscribe((value) => values.push(value));

    expect(values).toEqual([true]);

    unsubscribe();
    resolveLoad?.();
    await pendingNamespace;
  });

  it("gives a new initializing subscriber the host's current state, not the one captured at creation", async () => {
    const initializing = createInitializingStore(fake.asI18n());
    const pendingInit = fake.init();

    const values: boolean[] = [];
    const unsubscribe = initializing.subscribe((value) => values.push(value));

    expect(values).toEqual([true]);

    unsubscribe();
    await pendingInit;
  });

  it("gives a new defaultParams subscriber the host's current defaults, not the ones captured at creation", () => {
    const defaultParams = createDefaultParamsStore(fake.asI18n());
    fake.setDefaultParams({ formality: "formal" });

    const values: unknown[] = [];
    const unsubscribe = defaultParams.subscribe((value) => values.push(value));

    expect(values).toEqual([{ formality: "formal" }]);

    unsubscribe();
  });

  it.each(memoizedStoreFactories)(
    "%s returns the same store instance for repeated calls on one host",
    (_name, createStore) => {
      const host = fake.asI18n();

      expect(createStore(host)).toBe(createStore(host));
    },
  );

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
