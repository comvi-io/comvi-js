import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("normalizeTranslationObject — no input mutation", () => {
  it("addTranslations does not mutate the caller's object", () => {
    const catalog = { hello: "Hello" };
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: catalog });

    expect(Object.getPrototypeOf(catalog)).toBe(Object.prototype);
    expect(i18n.t("hello")).toBe("Hello");
  });

  it("constructor translation option does not mutate the caller's object", () => {
    const catalog = { greet: "Hi" };
    const i18n = new I18n({ locale: "en", translation: { en: catalog } });

    expect(Object.getPrototypeOf(catalog)).toBe(Object.prototype);
    expect(i18n.t("greet")).toBe("Hi");
  });

  it("later cache merges do not leak keys into the user's object", () => {
    const catalog: Record<string, string> = { hello: "Hello" };
    const i18n = new I18n({ locale: "en", translation: { en: catalog } });

    i18n.addTranslations({ en: { extra: "X" } });

    expect(catalog.extra).toBeUndefined();
    expect(i18n.t("extra")).toBe("X");
  });
});

describe("catalog leaf hardening — non-string values", () => {
  it("array, number, and null leaves do not crash t()", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { list: ["a", "b"], num: 5, nothing: null } as never,
    });

    expect(() => i18n.t("list")).not.toThrow();
    expect(i18n.t("list")).toBe("a,b");
    expect(i18n.t("num")).toBe("5");
    // null leaves are dropped → key behaves as missing
    expect(i18n.t("nothing")).toBe("nothing");
  });

  it("nested catalogs with array leaves do not crash t()", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { menu: { items: ["one", "two"], title: "Menu" } } as never,
    });

    expect(i18n.t("menu.title")).toBe("Menu");
    expect(i18n.t("menu.items")).toBe("one,two");
  });
});

describe("isInitializing — owned by init()", () => {
  it("stays true while a locale detector switches locale during init()", async () => {
    const i18n = new I18n({ locale: "en" });
    let flagInsideLoader: boolean | undefined;

    i18n.use((inst) => {
      inst.registerLocaleDetector(() => "de");
    });
    i18n.registerLoader(async () => {
      flagInsideLoader = i18n.isInitializing;
      return { greeting: "Hallo" };
    });

    const initializingStates: boolean[] = [];
    i18n.on("loadingStateChanged", ({ isInitializing }) => {
      initializingStates.push(isInitializing);
    });

    await i18n.init();

    expect(flagInsideLoader).toBe(true);
    // No event may report isInitializing=false before init() completes;
    // the final event reports false.
    expect(initializingStates[initializingStates.length - 1]).toBe(false);
    expect(initializingStates.slice(0, -1).every(Boolean)).toBe(true);
    expect(i18n.isInitializing).toBe(false);
    expect(i18n.locale).toBe("de");
  });
});

describe("setLocaleAsync — revert-to-current cancels in-flight change", () => {
  it("locale stays at the last requested value", async () => {
    const i18n = new I18n({ locale: "en", translation: { en: { greet: "Hello" } } });
    const de = deferred<Record<string, string>>();
    i18n.registerLoader((loc) => (loc === "de" ? de.promise : Promise.resolve({})));
    await i18n.init();

    const changes: string[] = [];
    i18n.on("localeChanged", ({ to }) => changes.push(to));

    const dePromise = i18n.setLocaleAsync("de"); // pending on loader
    await i18n.setLocaleAsync("en"); // revert — must cancel the "de" change

    de.resolve({ greet: "Hallo" });
    await dePromise;

    expect(i18n.locale).toBe("en");
    expect(changes).toEqual([]);
  });
});

describe("clearTranslations / reloadTranslations — pending load cancellation", () => {
  it("a load in flight when clearTranslations() is called does not repopulate the cache", async () => {
    const d = deferred<Record<string, string>>();
    const i18n = new I18n({ locale: "en" });
    i18n.registerLoader(() => d.promise);

    const loadPromise = i18n.addActiveNamespace("default");
    i18n.clearTranslations();
    d.resolve({ hello: "Hello" });
    await loadPromise;

    expect(i18n.hasLocale("en")).toBe(false);
    expect(i18n.getLoadedLocales()).toEqual([]);
  });

  it("scoped clearTranslations() only cancels loads in that scope", async () => {
    const slow = deferred<Record<string, string>>();
    const i18n = new I18n({ locale: "en" });
    i18n.registerLoader((_loc, ns) =>
      ns === "admin" ? slow.promise : Promise.resolve({ hello: "Hello" }),
    );

    const adminLoad = i18n.addActiveNamespace("admin");
    const defaultLoad = i18n.addActiveNamespace("default");
    i18n.clearTranslations("en", "admin");
    slow.resolve({ panel: "Panel" });
    await Promise.all([adminLoad, defaultLoad]);

    expect(i18n.hasLocale("en", "admin")).toBe(false);
    expect(i18n.hasLocale("en", "default")).toBe(true);
  });

  it("reloadTranslations() fetches fresh data instead of resolving an in-flight stale request", async () => {
    let calls = 0;
    const first = deferred<Record<string, string>>();
    const i18n = new I18n({ locale: "en" });
    i18n.registerLoader(() => {
      calls++;
      return calls === 1 ? first.promise : Promise.resolve({ v: "fresh" });
    });

    const initial = i18n.addActiveNamespace("default"); // pending (call 1)
    const reload = i18n.reloadTranslations("en", "default"); // cancels call 1, starts call 2
    first.resolve({ v: "stale" });
    await Promise.all([initial, reload]);

    expect(calls).toBe(2);
    expect(i18n.t("v")).toBe("fresh");
  });
});

describe("missing key — params.fallback priority", () => {
  it("params.fallback wins and the instance-level onMissingKey option is skipped", () => {
    const onMissingKey = vi.fn(() => "from-config");
    const i18n = new I18n({ locale: "en", onMissingKey });

    expect(i18n.t("missing", { fallback: "from-call" })).toBe("from-call");
    expect(onMissingKey).not.toHaveBeenCalled();
  });

  it("registered onMissingKey callbacks still fire for tracking", () => {
    const i18n = new I18n({ locale: "en" });
    const cb = vi.fn();
    i18n.onMissingKey(cb);

    expect(i18n.t("missing2", { fallback: "x" })).toBe("x");
    expect(cb).toHaveBeenCalledWith("missing2", "en", "default");
  });
});
