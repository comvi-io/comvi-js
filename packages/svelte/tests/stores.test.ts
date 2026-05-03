import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createI18n } from "@comvi/core";
import {
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
    const before = get(cacheRevision);

    fake.addTranslations({ en: { welcome: "Welcome" } });
    const afterAdd = get(cacheRevision);
    fake.clearTranslations("en", "common");
    const afterClear = get(cacheRevision);

    expect(afterAdd).toBeGreaterThan(before);
    expect(afterClear).toBeGreaterThan(afterAdd);
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
});
