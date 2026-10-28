import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  EmitError,
  emitCatalogs,
  parseWireSchema,
  serializeWireSchema,
  type WireSchema,
} from "../src/index";
import { selectsWithoutOptions } from "../src/v2/emit";

const schema = (namespaces: WireSchema["namespaces"]): WireSchema => ({
  v: 2,
  sourceLocale: "en",
  namespaces,
});

describe("emitCatalogs", () => {
  it("emits the Catalogs declaration: flat params, sorted, every kind typed", () => {
    expect(
      emitCatalogs(
        schema({
          shop: { "cart.title": { params: { count: { kind: "plural" } } } },
          default: {
            title: {},
            terms: { tags: ["link"] },
            gender: { params: { g: { kind: "select", options: ["male", "female"], other: true } } },
            closed: { params: { g: { kind: "select", options: ["a"], other: false } } },
            hello: { params: { name: { kind: "string" }, brand: { kind: "string" } } },
            rank: { params: { n: { kind: "selectordinal" } } },
            refused: {
              params: { d: { kind: "date" }, t: { kind: "time" }, x: { kind: "number" } },
            },
            'it\'s "q"': { params: { "a-b": { kind: "string" } } },
          },
          empty: {},
        }),
        { augment: "@comvi/react", defaultParams: ["brand"] },
      ),
    ).toBe(`/**
 * Comvi translation catalogs, augmenting '@comvi/react'
 * DO NOT EDIT — this file is generated from your translation schema
 */

import type { Tag } from '@comvi/react';

declare module '@comvi/react' {
  interface Catalogs {
    "default": {
      "closed": { "g": "a" };
      "gender": { "g": "male" | "female" | (string & {}) };
      "hello": { "brand"?: string | number; "name": string | number };
      "it's \\"q\\"": { "a-b": string | number };
      "rank": { "n": number };
      "refused": { "d": Date | number; "t": Date | number; "x": number };
      "terms": { "link": Tag };
      "title": never;
    };
    "empty": {};
    "shop": {
      "cart.title": { "count": number };
    };
  }
}

export {};
`);
  });

  it("imports the augmented module for its side effect when no key has a tag", () => {
    const out = emitCatalogs(schema({ default: { a: {} } }));
    expect(out).toContain("import '@comvi/core';\n\ndeclare module '@comvi/core' {");
    expect(out).not.toContain("Tag");
  });

  it("types a select with `other` and no options as string", () => {
    expect(
      emitCatalogs(
        schema({ default: { k: { params: { g: { kind: "select", options: [], other: true } } } } }),
      ),
    ).toContain('"k": { "g": string };');
  });

  it("types a select with neither options nor `other` as string (a key stays callable)", () => {
    const s = schema({ default: { k: { params: { g: { kind: "select", other: false } } } } });
    expect(emitCatalogs(s)).toContain('"k": { "g": string };');
    expect(selectsWithoutOptions(s)).toEqual([["default", "k", "g"]]);
  });

  it("refuses params and tags named ns, locale or markers (R3-14 H9), listing every one", () => {
    let error: unknown;
    try {
      emitCatalogs(
        schema({
          default: {
            a: { params: { ns: { kind: "string" }, ok: { kind: "string" } } },
            b: { params: { locale: { kind: "plural" } } },
            c: { tags: ["markers"] },
          },
        }),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EmitError);
    expect((error as EmitError).problems).toEqual([
      '"default" "a": the message uses {ns}, but `ns` is a per-call option of t() (ns, locale, markers) and never reaches a message — rename the param',
      '"default" "b": the message uses {locale}, but `locale` is a per-call option of t() (ns, locale, markers) and never reaches a message — rename the param',
      '"default" "c": the message uses {markers}, but `markers` is a per-call option of t() (ns, locale, markers) and never reaches a message — rename the param',
    ]);
  });

  it("refuses an augment that is not a module specifier", () => {
    expect(() => emitCatalogs(schema({}), { augment: "x'; evil" })).toThrow(/module specifier/);
  });

  it("emits a file TypeScript parses with no diagnostics", () => {
    const out = emitCatalogs(
      schema({ default: { "a\nb": { params: { "x y": { kind: "string" } }, tags: ["b"] } } }),
    );
    const file = ts.createSourceFile("comvi.d.ts", out, ts.ScriptTarget.Latest, true);
    expect((file as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics).toEqual([]);
  });

  it("is byte-identical for equal schemas whatever their key and param order", () => {
    const a = parseWireSchema({
      v: 2,
      sourceLocale: "en",
      namespaces: {
        b: { y: {}, x: { params: { q: { kind: "string" }, p: { kind: "plural" } } } },
        a: {},
      },
    });
    const b = parseWireSchema({
      v: 2,
      sourceLocale: "en",
      namespaces: {
        a: {},
        b: { x: { params: { p: { kind: "plural" }, q: { kind: "string" } } }, y: {} },
      },
    });
    expect(emitCatalogs(a)).toBe(emitCatalogs(b));
    expect(serializeWireSchema(a)).toBe(serializeWireSchema(b));
  });
});

describe("parseWireSchema", () => {
  it.each([
    [null, "(root): expected an object"],
    [{ v: 1, sourceLocale: "en", namespaces: {} }, "v: expected 2, received 1"],
    [{ v: 2, sourceLocale: "", namespaces: {} }, "sourceLocale: expected a non-empty string"],
    [{ v: 2, sourceLocale: "en", namespaces: [] }, "namespaces: expected an object"],
    [
      { v: 2, sourceLocale: "en", namespaces: { d: { k: 1 } } },
      'namespaces["d"]["k"]: expected an object',
    ],
    [
      { v: 2, sourceLocale: "en", namespaces: { d: { k: { params: { x: { kind: "money" } } } } } },
      'namespaces["d"]["k"].params["x"].kind: expected one of string, number, plural, selectordinal, select, date, time, received "money"',
    ],
    [
      {
        v: 2,
        sourceLocale: "en",
        namespaces: { d: { k: { params: { x: { kind: "select", options: [1] } } } } },
      },
      'namespaces["d"]["k"].params["x"].options: expected an array of strings',
    ],
    [
      {
        v: 2,
        sourceLocale: "en",
        namespaces: { d: { k: { params: { x: { kind: "select", other: "yes" } } } } },
      },
      'namespaces["d"]["k"].params["x"].other: expected a boolean',
    ],
    [
      { v: 2, sourceLocale: "en", namespaces: { d: { k: { tags: "b" } } } },
      'namespaces["d"]["k"].tags: expected an array of strings',
    ],
  ])("refuses %j", (input, message) => {
    expect(() => parseWireSchema(input)).toThrow(`Invalid typegen schema v2 at ${message}`);
  });

  it("serializes a namespace, key and param named __proto__ (round trip)", () => {
    const text =
      '{"v":2,"sourceLocale":"en","namespaces":{"__proto__":{"__proto__":{"params":{"__proto__":{"kind":"string"}}}}}}';
    const parsed = parseWireSchema(JSON.parse(text));
    const again = parseWireSchema(JSON.parse(serializeWireSchema(parsed)));
    expect(again).toEqual(parsed);
    expect(Object.keys(again.namespaces)).toEqual(["__proto__"]);
    expect(Object.keys(again.namespaces.__proto__.__proto__.params!)).toEqual(["__proto__"]);
  });

  it("keeps a key named __proto__ as data", () => {
    const parsed = parseWireSchema(
      JSON.parse('{"v":2,"sourceLocale":"en","namespaces":{"default":{"__proto__":{}}}}'),
    );
    expect(Object.keys(parsed.namespaces.default)).toEqual(["__proto__"]);
    expect(emitCatalogs(parsed)).toContain('"__proto__": never;');
  });
});
