import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { attachPlugins } from "../../src/plugins";

/**
 * `withMessages(catalogs)`: a read view whose `t` / `tRaw` / `hasTranslation`
 * resolve `catalogs` first, for that one call, and otherwise read the cache.
 * The i18n instance itself is never written.
 */
const host = () =>
  createI18n({
    locale: "en",
    fallbackLocale: "en",
    messages: { en: { greeting: "Hello", farewell: "Bye" } },
    exposeGlobal: false,
  });

const DE = { "de:default": { greeting: "Hallo {name}" } };

describe("withMessages() read view", () => {
  it("resolves a key from the given catalogs first", () => {
    const view = host().withMessages({ "en:default": { greeting: "Hi" } });

    expect(view.t("greeting")).toBe("Hi");
    expect(view.tRaw("greeting")).toBe("Hi");
    // `de` is not cached: its fallback, `en`, is read from the catalogs too.
    expect(view.t("greeting", { locale: "de" })).toBe("Hi");
  });

  it("reads another locale and namespace from the catalogs, interpolating as usual", () => {
    const view = host().withMessages(DE);

    expect(view.t("greeting", { locale: "de", name: "Ann" })).toBe("Hallo Ann");
    expect(view.tRaw("greeting", { locale: "de", name: "Ann" })).toBe("Hallo Ann");
  });

  it("falls back to the cache for a key or catalog it does not hold", () => {
    const view = host().withMessages(DE);

    expect(view.t("greeting")).toBe("Hello");
    // `de` has no `farewell`: the fallback chain reads the cache.
    expect(view.t("farewell", { locale: "de" })).toBe("Bye");
  });

  it("answers hasTranslation from the catalogs", () => {
    const i18n = host();
    const view = i18n.withMessages(DE);

    expect(view.hasTranslation("greeting", "de")).toBe(true);
    expect(view.hasTranslation("farewell", "de")).toBe(false);
    expect(view.hasTranslation("farewell", "de", undefined, true)).toBe(true);
    expect(i18n.hasTranslation("greeting", "de")).toBe(false);
  });

  it("writes nothing to the i18n instance and emits nothing", () => {
    const i18n = host();
    const events: string[] = [];
    i18n.on("namespaceLoaded", () => events.push("namespaceLoaded"));
    const revision = i18n.messagesCache.getRevision();

    i18n.withMessages({ ...DE, "de:admin": { title: "Konsole" } }).t("greeting", { locale: "de" });

    expect(i18n.hasLocale("de")).toBe(false);
    expect(i18n.getLoadedLocales()).toEqual(["en"]);
    expect(i18n.getActiveNamespaces()).toEqual(["default"]);
    expect(i18n.messagesCache.getRevision()).toBe(revision);
    expect(events).toEqual([]);
  });

  it("applies only inside a view call: a plain t() afterwards reads the cache", () => {
    const i18n = host();
    const view = i18n.withMessages({ "en:default": { greeting: "Hi" } });

    expect(view.t("greeting")).toBe("Hi");
    expect(i18n.t("greeting")).toBe("Hello");
    expect(i18n.hasTranslation("greeting", "de")).toBe(false);
  });

  it("leaves the instance as it was when a view call throws", () => {
    // `onMissingKey` is not wrapped, so its throw leaves `t()` mid-call.
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" } },
      exposeGlobal: false,
      onMissingKey: () => {
        throw new Error("missing-key handler failed");
      },
    });
    const view = i18n.withMessages({ "en:default": { greeting: "Hi" } });

    expect(() => view.t("absent")).toThrow("missing-key handler failed");
    expect(i18n.t("greeting")).toBe("Hello");
    expect(view.t("greeting")).toBe("Hi");
  });

  it("keeps views independent: a call inside another view's call reads only its own catalogs", () => {
    const i18n = attachPlugins(host());
    const inner = i18n.withMessages({ "en:default": { greeting: "Inner" } });
    // Runs inside the outer view's call: the inner view and the instance
    // itself must not see the outer catalogs.
    i18n.registerPostProcessor((result, key) =>
      key === "outer" ? `${result}+${inner.t("greeting")}+${i18n.t("probe")}` : result,
    );
    const outer = i18n.withMessages({ "en:default": { outer: "O", probe: "P" } });

    expect(outer.t("outer")).toBe("O+Inner+probe");
    expect(outer.t("probe")).toBe("P");
  });

  it("a view made before a later addMessages still prefers its own catalog", () => {
    const i18n = host();
    const view = i18n.withMessages({ "en:default": { greeting: "Hi" } });

    i18n.addMessages({ en: { greeting: "Hey" }, uk: { greeting: "Привіт" } });

    expect(view.t("greeting")).toBe("Hi");
    // A catalog the view does not hold comes from the cache, as it is now.
    expect(view.t("greeting", { locale: "uk" })).toBe("Привіт");
    expect(i18n.t("greeting")).toBe("Hey");
  });

  it("grows no state of its own: the view's only own property is its catalogs", () => {
    const i18n = host();
    const ownKeysBefore = Object.keys(i18n).sort();
    const view = i18n.withMessages(DE);

    // Every read path, including the primary-catalog memo the fast lookups refresh.
    view.t("greeting");
    view.tRaw("greeting", { locale: "de", name: "Ann" });
    view.t("absent");
    view.hasTranslation("greeting", "de", undefined, true);
    i18n.addMessages({ en: { greeting: "Hey" } });
    view.t("greeting");

    expect(Object.keys(view)).toHaveLength(1);
    expect(Object.keys(i18n).sort()).toEqual(ownKeysBefore);
    expect(Object.getPrototypeOf(view)).toBe(i18n);
  });
});
