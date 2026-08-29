import { describe, it, expect, beforeEach } from "vitest";
// The BASE host: simple compiler, no ambient extensions.
import { createI18n } from "../../src";
import { clearTemplateCache } from "../../src/core/translate";
import { createElement } from "../../src/virtualNode";
import type { ElementNode } from "../../src";

// A systematic table over the arrangements that arm or miss the single-parameter render
// route — when a neighbouring one falls into it, segments are silently swallowed.

const render = (template: string, params?: Record<string, unknown>) => {
  const i18n = createI18n({ locale: "en", translation: { en: { msg: template } } });
  return i18n.t("msg" as never, params as never);
};

beforeEach(() => {
  clearTemplateCache();
});

describe("t() — a template with one parameter", () => {
  it("`{a}` → the parameter value alone", () => {
    expect(render("{a}", { a: "one" })).toBe("one");
  });

  it("`{a}!` → the value followed by the trailing text", () => {
    expect(render("{a}!", { a: "one" })).toBe("one!");
  });

  it("`Hi {a}` → the leading text followed by the value", () => {
    expect(render("Hi {a}", { a: "one" })).toBe("Hi one");
  });

  it("`Hi {a}!` → the value between both texts", () => {
    expect(render("Hi {a}!", { a: "one" })).toBe("Hi one!");
  });

  it("`Hi { a }!` → the value, with the placeholder's spaces trimmed", () => {
    expect(render("Hi { a }!", { a: "one" })).toBe("Hi one!");
  });
});

describe("t() — a template with more than one parameter", () => {
  it("`{a}{b}` → both values, in order", () => {
    expect(render("{a}{b}", { a: "one", b: "two" })).toBe("onetwo");
  });

  it("`{a}{b}!` → both values and the trailing text", () => {
    expect(render("{a}{b}!", { a: "one", b: "two" })).toBe("onetwo!");
  });

  it("`Hi {a}{b}` → the leading text and both values", () => {
    expect(render("Hi {a}{b}", { a: "one", b: "two" })).toBe("Hi onetwo");
  });

  it("`{a}{b}{c}` → all three values", () => {
    expect(render("{a}{b}{c}", { a: "one", b: "two", c: "three" })).toBe("onetwothree");
  });

  it("`{a} to {b}!` → every text and value segment", () => {
    expect(render("{a} to {b}!", { a: "one", b: "two" })).toBe("one to two!");
  });
});

describe("tRaw() — a node parameter", () => {
  it("a node at the start of the template → no empty string before it", () => {
    const node = createElement("b", {}, ["bold"]);

    const result = createI18n({
      locale: "en",
      translation: { en: { msg: "{node} tail" } },
    }).tRaw("msg" as never, { node } as never);

    expect(result).toEqual([node, " tail"]);
  });

  it("text on both sides of a node → one string on each side", () => {
    const node: ElementNode = createElement("b", {}, ["bold"]);

    const result = createI18n({
      locale: "en",
      translation: { en: { msg: "head {node} tail" } },
    }).tRaw("msg" as never, { node } as never);

    expect(result).toEqual(["head ", node, " tail"]);
  });
});
