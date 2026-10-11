import { describe, it, expect, vi } from "vitest";
import { flattenCatalog } from "../../src";
import { I18n } from "../helpers/composedInstance";

/**
 * Catalog ingestion never mutates or exposes a caller-owned object. Only a
 * null-prototype catalog whose values are all strings is adopted by reference,
 * and a merge always copies, so the adopted object is never written either.
 * The flatten fast paths must keep every one of these, and v0.5.0's key order
 * and flat-vs-nested collision precedence.
 */

const nullProto = <T extends object>(entries: T): T => Object.assign(Object.create(null), entries);

describe("catalog ingestion isolation", () => {
  it("leaves plain caller objects, flat and nested, unchanged and unexposed", () => {
    const flat = { hello: "Hello", bye: "Bye" };
    const nested = { nav: { home: "Home", about: { title: "About" } }, top: "Top" };
    const snapshot = structuredClone({ flat, nested });
    const i18n = new I18n({ locale: "en", messages: { en: flat } });

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
