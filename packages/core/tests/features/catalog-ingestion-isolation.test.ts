import { afterEach, describe, it, expect, vi } from "vitest";
import { flattenCatalog } from "../../src";
import { I18n } from "../helpers/composedInstance";

/**
 * Catalog ingestion never mutates a caller-owned object. A catalog that is
 * already flat (every own value a string, on a null prototype or a plain
 * `Object.prototype` object) is kept BY REFERENCE; anything else is flattened
 * into a fresh null-prototype copy with v0.5.0's key order and flat-vs-nested
 * collision precedence. A merge always copies, so a kept object is never
 * written. Keys inherited from `Object.prototype` never resolve: the lookup
 * guard answers only own values, not the absence of a prototype.
 */

const nullProto = <T extends object>(entries: T): T => Object.assign(Object.create(null), entries);

describe("catalog ingestion isolation", () => {
  it("leaves plain caller objects, flat and nested, unchanged and unexposed", () => {
    const flat = { hello: "Hello", bye: "Bye" };
    const nested = { nav: { home: "Home", about: { title: "About" } }, top: "Top" };
    const snapshot = structuredClone({ flat, nested });
    const i18n = new I18n({ locale: "en", messages: { en: flat } });
    expect(i18n.getMessages()).toBe(flat);

    i18n.addMessages({ en: nested });
    i18n.addMessages({ en: { extra: "X" } });

    expect({ flat, nested }).toStrictEqual(snapshot);
    expect(Object.getPrototypeOf(flat)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(nested.nav)).toBe(Object.prototype);
    expect(i18n.getMessages()).not.toBe(flat);
    expect(i18n.t("hello")).toBe("Hello");
    expect(i18n.t("nav.about.title")).toBe("About");
    expect(i18n.t("extra")).toBe("X");
  });

  it("never mutates an adopted null-prototype catalog on a later merge", () => {
    const catalog = nullProto({ hello: "Hello" }) as Record<string, string>;
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });
    expect(i18n.getMessages()).toBe(catalog);

    i18n.addMessages({ en: { extra: "X", hello: "Hi" } });
    i18n.addMessages({ en: nullProto({ more: "M" }) });

    expect(Object.keys(catalog)).toStrictEqual(["hello"]);
    expect(catalog.hello).toBe("Hello");
    expect(i18n.getMessages()).not.toBe(catalog);
    expect(i18n.t("hello")).toBe("Hi");
    expect(i18n.t("extra")).toBe("X");
    expect(i18n.t("more")).toBe("M");
  });

  it("re-ingests a flattenCatalog result flattened once a nested value is added to it", () => {
    const flat = flattenCatalog({ a: { b: "x" } }) as Record<string, any>;
    flat.nav = { home: "Home" };
    const i18n = new I18n({ locale: "en" });

    i18n.addMessages({ en: flat });

    expect(i18n.getMessages()).not.toBe(flat);
    expect(i18n.t("a.b")).toBe("x");
    expect(i18n.t("nav.home")).toBe("Home");
    expect(flat.nav).toStrictEqual({ home: "Home" });
    expect(Object.keys(flat)).toStrictEqual(["a.b", "nav"]);
  });

  it.each([
    ["flat key before nested", { "a.b": "flat", a: { b: "nested" } }, [["a.b", "nested"]]],
    ["nested before flat key", { a: { b: "nested" }, "a.b": "flat" }, [["a.b", "nested"]]],
    [
      "two nested paths to one key: the later-pushed path is walked first",
      { x: { y: { z: "deep" } }, "x.y": { z: "mid" }, k: "v" },
      [
        ["k", "v"],
        ["x.y.z", "deep"],
      ],
    ],
    [
      "leaves of a level before its nested objects, siblings in reverse",
      { b: { c: "1" }, a: { d: "2" }, z: "3" },
      [
        ["z", "3"],
        ["a.d", "2"],
        ["b.c", "1"],
      ],
    ],
    [
      "leaves before the first object keep their order",
      { z: "3", y: "4", b: { c: "1" }, w: "5" },
      [
        ["z", "3"],
        ["y", "4"],
        ["w", "5"],
        ["b.c", "1"],
      ],
    ],
  ])("matches v0.5.0 collision precedence and key order: %s", (_label, input, entries) => {
    expect(Object.entries(flattenCatalog(input as Record<string, any>))).toStrictEqual(entries);
    expect(Object.entries(flattenCatalog(nullProto(input) as Record<string, any>))).toStrictEqual(
      entries,
    );
  });

  it("excludes inherited keys and keeps the leaf coercion warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const nav = Object.create({ ghost: "inherited" }) as Record<string, unknown>;
    nav.home = "Home";
    nav.count = 2;
    const top = Object.create({ phantom: "inherited" }) as Record<string, unknown>;
    top.list = ["a", "b"];
    top.nav = nav;
    top.gone = null;

    const flat = flattenCatalog(top as Record<string, any>);

    expect(Object.entries(flat)).toStrictEqual([
      ["list", "a,b"],
      ["nav.home", "Home"],
      ["nav.count", "2"],
    ]);
    expect(warnSpy.mock.calls.map((call) => call[0])).toStrictEqual([
      '[@comvi/core] Translation "list" is not a string (got array); coercing with String()',
      '[@comvi/core] Dropping translation "gone": value is null',
      '[@comvi/core] Translation "nav.count" is not a string (got number); coercing with String()',
    ]);

    warnSpy.mockClear();
    const adoptedCandidate = nullProto({ hello: "Hello", n: 1 });
    expect(Object.entries(flattenCatalog(adoptedCandidate))).toStrictEqual([
      ["hello", "Hello"],
      ["n", "1"],
    ]);
    expect(flattenCatalog(adoptedCandidate)).not.toBe(adoptedCandidate);
    expect(warnSpy).toHaveBeenCalledWith(
      '[@comvi/core] Translation "n" is not a string (got number); coercing with String()',
    );
  });
});

describe("flat plain-object catalogs kept by reference", () => {
  const proto = Object.prototype as Record<string, unknown>;
  afterEach(() => {
    delete proto.foo;
  });

  it("stores the caller's object as is and never changes it", () => {
    const catalog = { hello: "Hello", bye: "Bye" };
    const snapshot = structuredClone(catalog);
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    expect(i18n.getMessages()).toBe(catalog);
    expect(i18n.t("hello")).toBe("Hello");
    i18n.t("missing");
    i18n.hasTranslation("bye");

    expect(catalog).toStrictEqual(snapshot);
    expect(Object.getPrototypeOf(catalog)).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(catalog)).toStrictEqual(["hello", "bye"]);
    expect(Object.isExtensible(catalog)).toBe(true);
  });

  it("keeps a frozen catalog by reference and merges around it", () => {
    const catalog = Object.freeze({ hello: "Hello" });
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    expect(i18n.getMessages()).toBe(catalog);
    i18n.addMessages({ en: { extra: "X" } });

    expect(i18n.t("hello")).toBe("Hello");
    expect(i18n.t("extra")).toBe("X");
    expect(Object.keys(catalog)).toStrictEqual(["hello"]);
  });

  it("never resolves keys inherited from Object.prototype", () => {
    const i18n = new I18n({ locale: "en", messages: { en: { real: "Real" } } });

    expect(Object.getPrototypeOf(i18n.getMessages())).toBe(Object.prototype);
    expect(i18n.t("constructor")).toBe("constructor");
    expect(i18n.t("toString")).toBe("toString");
    expect(i18n.t("__proto__")).toBe("__proto__");
    expect(i18n.hasTranslation("toString")).toBe(false);
    expect(i18n.hasTranslation("constructor")).toBe(false);
    expect(i18n.t("real")).toBe("Real");
  });

  it("does not leak an enumerable key added to Object.prototype before ingestion", () => {
    proto.foo = "x";
    const catalog = { real: "Real" };
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    // A polluted environment takes the copy path.
    expect(i18n.getMessages()).not.toBe(catalog);
    expect(i18n.t("foo")).toBe("foo");
    expect(i18n.hasTranslation("foo")).toBe(false);
    expect(i18n.t("real")).toBe("Real");
  });

  // Documented limit, as in peer libraries: pollution AFTER a plain catalog
  // was kept is not guarded. Only the ingest-time check sends a polluted
  // environment down the copy path.
  it("does not guard against a key added to Object.prototype after ingestion", () => {
    const catalog = { real: "Real" };
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });
    expect(i18n.getMessages()).toBe(catalog);

    proto.foo = "x";

    expect(i18n.t("foo")).toBe("x");
    expect(i18n.t("real")).toBe("Real");
  });

  // Intended semantics, as in i18next: the instance reads the object it was
  // given, so an edit to it is visible to the next lookup. No `configChanged`
  // or `namespaceLoaded` is emitted; `addMessages` is the way to publish one.
  it("shows the caller's later edits to the kept object", () => {
    const catalog: Record<string, unknown> = { hello: "Hello" };
    const i18n = new I18n({ locale: "en", messages: { en: catalog as Record<string, string> } });
    expect(i18n.t("hello")).toBe("Hello");
    const namespaceLoaded = vi.fn();
    const configChanged = vi.fn();
    i18n.on("namespaceLoaded", namespaceLoaded);
    i18n.on("configChanged", configChanged);

    catalog.hello = "Hi";
    catalog.added = "Added";
    expect(i18n.t("hello")).toBe("Hi");
    expect(i18n.t("added")).toBe("Added");

    catalog.count = 5;
    catalog.flag = true;
    catalog.fn = () => "nope";
    catalog.obj = { a: "b" };
    catalog.empty = "";
    catalog.gone = undefined;
    // Only strings are templates at read time: a number or boolean written
    // after ingestion is missing (one present AT ingestion is copied and
    // coerced, see below).
    expect(i18n.t("count")).toBe("count");
    expect(i18n.t("flag")).toBe("flag");
    expect(i18n.t("fn")).toBe("fn");
    expect(i18n.t("obj")).toBe("obj");
    expect(i18n.t("empty")).toBe("empty");
    expect(i18n.t("gone")).toBe("gone");
    expect(i18n.hasTranslation("fn")).toBe(false);
    expect(i18n.hasTranslation("count")).toBe(false);
    expect(namespaceLoaded).not.toHaveBeenCalled();
    expect(configChanged).not.toHaveBeenCalled();
  });

  it("resolves an own string property named like an Object.prototype member", () => {
    const catalog = { constructor: "Builder", toString: "As text", hello: "Hello" };
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    expect(i18n.getMessages()).toBe(catalog);
    expect(i18n.t("constructor")).toBe("Builder");
    expect(i18n.t("toString")).toBe("As text");
    expect(i18n.hasTranslation("constructor")).toBe(true);
  });

  // Outside the contract, so nothing is asserted: a non-enumerable own string
  // property (`Object.defineProperty(catalog, "k", { value: "v" })`) is not
  // seen by the ingestion scan or by `Object.keys`/JSON serialization, yet a
  // lookup on a kept catalog reads it. Accessors, Proxies and symbol keys are
  // likewise outside the supported catalog shape.

  it("lets two instances read one shared source object", () => {
    const catalog: Record<string, string> = { hello: "Hello" };
    const a = new I18n({ locale: "en", messages: { en: catalog } });
    const b = new I18n({ locale: "en", messages: { en: catalog } });

    expect(a.getMessages()).toBe(catalog);
    expect(b.getMessages()).toBe(catalog);
    a.addMessages({ en: { onlyA: "A" } });

    expect(a.t("onlyA")).toBe("A");
    expect(b.t("onlyA")).toBe("onlyA");
    expect(b.t("hello")).toBe("Hello");
    expect(Object.keys(catalog)).toStrictEqual(["hello"]);
  });

  it("still flattens a nested catalog into a fresh null-prototype copy", () => {
    const catalog = { nav: { home: "Home" }, top: "Top" };
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    expect(i18n.getMessages()).not.toBe(catalog);
    expect(Object.getPrototypeOf(i18n.getMessages())).toBeNull();
    expect(i18n.t("nav.home")).toBe("Home");
    expect(i18n.t("top")).toBe("Top");
  });

  it("copies a catalog with a number leaf and renders it as a string", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalog = { total: 5, label: "Total" } as unknown as Record<string, string>;
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    expect(i18n.getMessages()).not.toBe(catalog);
    expect(i18n.t("total")).toBe("5");
  });

  it("copies a catalog with a custom prototype", () => {
    const catalog = Object.assign(Object.create({ inherited: "no" }), { own: "Own" });
    const i18n = new I18n({ locale: "en", messages: { en: catalog } });

    expect(i18n.getMessages()).not.toBe(catalog);
    expect(i18n.t("own")).toBe("Own");
    expect(i18n.t("inherited")).toBe("inherited");
  });

  // A withMessages catalog is expected to hold strings. Its value wins the
  // lookup whenever it is truthy, so a truthy non-string reads as missing
  // instead of falling through to the cache; an empty string falls through.
  it("reads a truthy non-string withMessages value as missing", () => {
    const i18n = new I18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const view = i18n.withMessages({
      "en:default": {
        greeting: 42 as unknown as string,
        other: (() => "x") as unknown as string,
      },
    });
    const objectValued = i18n.withMessages({
      "en:default": { greeting: { nested: "x" } as unknown as string },
    });
    const empty = i18n.withMessages({ "en:default": { greeting: "" } });

    expect(view.t("greeting")).toBe("greeting");
    expect(view.t("other")).toBe("other");
    expect(view.t("toString")).toBe("toString");
    expect(objectValued.t("greeting")).toBe("greeting");
    expect(objectValued.hasTranslation("greeting")).toBe(false);
    expect(empty.t("greeting")).toBe("Hello");
  });
});
