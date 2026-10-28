/**
 * The compile cache (R4-1/R4-2) and catalog ingestion at the compile layer.
 * Ported by meaning from: hot-path-invariants, post-process-static-template,
 * catalog-ingestion-isolation, host-catalog-inherited-keys, catalog-null-prototype-nesting,
 * template-cache-*, translation-cache*, fallback-param-shared-cache.
 * New (lot-0 S1): cow-identity, records independent of renderers.
 */
import { describe, expect, it, vi } from "vitest";
import { compile, inherit, lookup, recordFor, render, type Catalog } from "../../src/compile/cache";
import * as scanner from "../../src/compile/scanner";

describe("compile", () => {
  it("returns a template without syntax as the very string (R4-1c)", () => {
    const t = "Plain text } with # and > signs";
    expect(compile(t)).toBe(t);
    expect(typeof compile(t)).toBe("string");
  });

  it("returns a static string when quoting is the only syntax", () => {
    expect(compile("It''s '{fine}'")).toBe("It's {fine}");
    expect(compile("")).toBe("");
  });

  it("returns a function for a template with arguments", () => {
    expect(typeof compile("{x}")).toBe("function");
  });

  it("parses each template once, however often it renders", () => {
    const spy = vi.spyOn(scanner, "message");
    const c = compile("{n, plural, one {# item} other {# items}}");
    const calls = spy.mock.calls.length;
    for (let n = 0; n < 50; n++) render(c, { n }, "en");
    expect(spy.mock.calls.length).toBe(calls);
  });
});

describe("records", () => {
  it("one record per catalog object, shared by every caller (process level)", () => {
    const cat: Catalog = { a: "{x}" };
    expect(recordFor(cat)).toBe(recordFor(cat));
    expect(recordFor({ ...cat })).not.toBe(recordFor(cat));
  });

  it("never keys records by per-instance data", () => {
    const cat: Catalog = { a: "<b>x</b>" };
    // renderers come from params at render time: one compiled entry serves both
    const c = lookup(recordFor(cat), cat, "a")!;
    expect(render(c, { b: () => "1" }, "en")).toBe("1");
    expect(render(c, { b: () => "2" }, "en")).toBe("2");
    expect(lookup(recordFor(cat), cat, "a")).toBe(c);
  });

  it("compiles lazily, once per key", () => {
    const cat: Catalog = { a: "{x}", b: "static" };
    const rec = recordFor(cat);
    expect(Object.keys(rec)).toEqual([]);
    const a = lookup(rec, cat, "a");
    expect(lookup(rec, cat, "a")).toBe(a);
    expect(lookup(rec, cat, "b")).toBe("static");
    expect(Object.keys(rec)).toEqual(["a", "b"]);
  });

  it("does not resolve inherited properties or Object.prototype members", () => {
    const proto = { inherited: "nope" };
    const cat = Object.assign(Object.create(proto), { own: "yes" }) as Catalog;
    const rec = recordFor(cat);
    expect(lookup(rec, cat, "own")).toBe("yes");
    expect(lookup(rec, cat, "inherited")).toBeUndefined();
    for (const k of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(lookup(rec, cat, k)).toBeUndefined();
    }
  });

  it("resolves an own key named like an Object.prototype member", () => {
    const cat = JSON.parse('{"toString":"ts","__proto__":"pp","constructor":"c"}') as Catalog;
    const rec = recordFor(cat);
    expect(lookup(rec, cat, "toString")).toBe("ts");
    expect(lookup(rec, cat, "__proto__")).toBe("pp");
    expect(lookup(rec, cat, "constructor")).toBe("c");
  });

  it("works on null-prototype catalogs", () => {
    const cat = Object.assign(Object.create(null), { a: "A" }) as Catalog;
    expect(lookup(recordFor(cat), cat, "a")).toBe("A");
  });

  it("treats a non-string value (a nested object, a number) as no message", () => {
    const cat = { nested: { a: "x" }, n: 5, s: "ok" } as unknown as Catalog;
    const rec = recordFor(cat);
    expect(lookup(rec, cat, "nested")).toBeUndefined();
    expect(lookup(rec, cat, "n")).toBeUndefined();
    expect(lookup(rec, cat, "s")).toBe("ok");
  });

  it("never mutates the catalog", () => {
    const cat = Object.freeze({ a: "{x}" });
    const rec = recordFor(cat);
    lookup(rec, cat, "a");
    expect(cat).toEqual({ a: "{x}" });
  });
});

describe("inherit (copy-on-write add, lot-0 S1 cow-identity)", () => {
  it("adding one key to a compiled 10K catalog reuses 9,999 compiled entries", () => {
    const base: Record<string, string> = {};
    for (let i = 0; i < 10_000; i++)
      base["k" + i] = i % 3 ? `{n, plural, other {# x${i}}}` : `static ${i}`;
    const prev = Object.freeze(base) as Catalog;
    const prevRec = recordFor(prev);
    for (const k in prev) lookup(prevRec, prev, k);

    const next = Object.freeze({ ...prev, k7: "changed {x}", added: "{y}" }) as Catalog;
    const spy = vi.spyOn(scanner, "message");
    const rec = inherit(prev, prevRec, next);

    let inherited = 0;
    for (const k in prev) if (rec[k] === prevRec[k]) inherited++;
    expect(inherited).toBe(9_999);
    expect(rec.k7).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();

    expect(render(lookup(rec, next, "k7")!, { x: 1 }, "en")).toBe("changed 1");
    expect(render(lookup(rec, next, "k8")!, { n: 2 }, "en")).toBe("2 x8");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not inherit an entry whose key was removed", () => {
    const prev = { a: "A", b: "{x}" } as Catalog;
    const prevRec = recordFor(prev);
    lookup(prevRec, prev, "a");
    lookup(prevRec, prev, "b");
    const next = { a: "A" } as Catalog;
    expect(Object.keys(inherit(prev, prevRec, next))).toEqual(["a"]);
  });
});
