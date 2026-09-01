import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import { createDeferred as deferred } from "../helpers/deferred";

describe("addTranslations() / the `translation` option — no input mutation", () => {
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

  it("adopts an already-prototype-less catalog on the first write instead of copying it", () => {
    // A host WITH the flattener gets a fresh prototype-less catalog out of it,
    // so the first write stores that object as-is. Object IDENTITY is the cheap,
    // deterministic proxy for "the constructor does not copy the whole catalog a
    // second time" — the copy that made `new I18n({ translation })` 2.5x slower.
    const catalog: Record<string, string> = Object.assign(Object.create(null), {
      hello: "Hello",
    });
    const i18n = new I18n({ locale: "en", translation: { en: catalog } });

    expect(i18n.getTranslations()).toBe(catalog);
    // A genuine merge still copies, so the adopted object is never mutated.
    i18n.addTranslations({ en: { extra: "X" } });
    expect(catalog.extra).toBeUndefined();
    expect(i18n.t("extra")).toBe("X");
    expect(i18n.t("hello")).toBe("Hello");
  });
});

describe("catalog leaf hardening — non-string values", () => {
  it("joins an array leaf, coerces a number leaf and drops a null leaf", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { list: ["a", "b"], num: 5, nothing: null } as never,
    });

    expect(i18n.t("list")).toBe("a,b");
    expect(i18n.t("num")).toBe("5");
    // A null leaf is dropped, so the key behaves as missing.
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
    // No event may report isInitializing=false before init() completes, and the
    // intermediate `true` must actually be emitted.
    expect(initializingStates).toEqual([true, false]);
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
