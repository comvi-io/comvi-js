import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported directly rather than
// through the tags-registering helper.
import { createI18n } from "../../src/core/full";
import { createI18n as createBaseI18n } from "../../src";
import { clearTemplateCache, _resetMissingParamWarnings } from "../../src/core/translate";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";
import { registerTagSyntax } from "../../src/core/translate/tags";
import type { TranslationParams } from "../../src/types";

// Importing the composite registered tag syntax AMBIENTLY (the base root
// registers nothing), which the tag path below relies on. The template cache
// and the warn-dedup set are module-level state: reset both so no variant and
// no already-emitted warning leaks between cases.
beforeEach(() => {
  clearTemplateCache();
  registerTagSyntax();
  _resetMissingParamWarnings();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

type Mode = "literal" | "drop";
type Params = TranslationParams | undefined;

function makeFull(mode?: Mode, translations?: Record<string, string>) {
  return createI18n({
    locale: "en",
    ...(mode ? { missingParam: mode } : {}),
    messages: { en: translations ?? {} },
  });
}

describe("missingParam — path 1: single-param fast path", () => {
  const translations = { greet: "Hello, {name}!" };

  it.each([
    { given: "an omitted params object", params: undefined, expected: "Hello, {name}!" },
    { given: "an empty params object", params: {}, expected: "Hello, {name}!" },
    { given: "an explicit undefined", params: { name: undefined }, expected: "Hello, {name}!" },
    { given: "an explicit null", params: { name: null }, expected: "Hello, !" },
  ])("literal (default): $given renders $expected", ({ params, expected }) => {
    const i18n = makeFull(undefined, translations);

    expect(i18n.t("greet", params as Params)).toBe(expected);
  });

  it.each([
    { given: "an empty params object", params: {} },
    { given: "an explicit undefined", params: { name: undefined } },
    { given: "an explicit null", params: { name: null } },
  ])("drop: $given renders empty (0.4.0 behavior)", ({ params }) => {
    const i18n = makeFull("drop", translations);

    expect(i18n.t("greet", params as Params)).toBe("Hello, !");
  });
});

describe("missingParam — path 2: simple-params fast path (multiple params)", () => {
  const translations = { pair: "{a} and {b}" };

  it.each([
    { given: "an absent param", params: { a: "left" }, expected: "left and {b}" },
    { given: "a null param", params: { a: "left", b: null }, expected: "left and " },
  ])("literal: $given renders $expected", ({ params, expected }) => {
    const i18n = makeFull(undefined, translations);

    expect(i18n.t("pair", params as Params)).toBe(expected);
  });

  it.each([
    { given: "an absent param", params: { a: "left" } },
    { given: "a null param", params: { a: "left", b: null } },
  ])("drop: $given renders empty", ({ params }) => {
    const i18n = makeFull("drop", translations);

    expect(i18n.t("pair", params as Params)).toBe("left and ");
  });
});

describe("missingParam — path 3: full token pipeline (template with ICU)", () => {
  const translations = { msg: "{count, plural, one {# file} other {# files}} for {name}" };

  it.each([
    { given: "an absent param", params: { count: 2 }, expected: "2 files for {name}" },
    { given: "a null param", params: { count: 2, name: null }, expected: "2 files for " },
  ])("literal: $given inside a complex template renders $expected", ({ params, expected }) => {
    const i18n = makeFull(undefined, translations);

    expect(i18n.t("msg", params as Params)).toBe(expected);
  });

  it.each([
    { given: "an absent param", params: { count: 2 } },
    { given: "a null param", params: { count: 2, name: null } },
  ])("drop: $given renders empty", ({ params }) => {
    const i18n = makeFull("drop", translations);

    expect(i18n.t("msg", params as Params)).toBe("2 files for ");
  });
});

describe("missingParam — path 4: tag interpolation (VirtualNode children)", () => {
  const translations = { msg: "<strong>{name}</strong>" };

  it("literal: missing param inside tag children produces a literal-text child", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: translations },
      tagInterpolation: { basicHtmlTags: ["strong"] },
    });

    const result = i18n.tRaw("msg");

    expect(result).toEqual([{ type: "element", tag: "strong", props: {}, children: ["{name}"] }]);
  });

  it("drop: missing param inside tag children renders nothing", () => {
    const i18n = createI18n({
      locale: "en",
      missingParam: "drop",
      messages: { en: translations },
      tagInterpolation: { basicHtmlTags: ["strong"] },
    });

    const result = i18n.tRaw("msg");

    expect(result).toEqual([{ type: "element", tag: "strong", props: {}, children: [] }]);
  });
});

describe("missingParam — path 5: slim compiler", () => {
  const makeSlim = (mode?: Mode) =>
    createBaseI18n({
      locale: "en",
      ...(mode ? { missingParam: mode } : {}),
      messages: { en: { greet: "Hi {name}!" } },
    });

  it.each([
    { given: "an empty params object", params: {}, expected: "Hi {name}!" },
    { given: "an explicit null", params: { name: null }, expected: "Hi !" },
  ])("literal (default): $given renders $expected, like the full entry", ({ params, expected }) => {
    const i18n = makeSlim();

    expect(i18n.t("greet" as never, params as never)).toBe(expected);
  });

  it("drop restores silent-drop", () => {
    const i18n = makeSlim("drop");

    expect(i18n.t("greet" as never, {} as never)).toBe("Hi !");
  });
});

describe("missingParam — dev warning", () => {
  it("warns once per (template, param) pair", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { warned: "Warn check {missingName}" });

    i18n.t("warned");
    i18n.t("warned");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[@comvi/core] Missing parameter "missingName" for template "Warn check {missingName}"',
    );
  });
});

/**
 * A function-valued parameter is a tag handler (`<link>…</link>`), never a
 * value for a `{link}` placeholder: the placeholder renders exactly as a
 * missing one does, in both modes; the development warning says what was
 * passed instead of calling it missing. Every other non-primitive value is
 * still coerced with `String()`.
 */
describe("a function-valued param under a placeholder", () => {
  const handler = ({ children }: { children: unknown }) => `[${String(children)}]`;

  it("literal (default), single-param template → the literal placeholder", () => {
    const i18n = makeFull(undefined, { msg: "See {link}." });

    expect(i18n.t("msg", { link: handler })).toBe("See {link}.");
  });

  it("literal (default), template with a plural → the literal placeholder", () => {
    const i18n = makeFull(undefined, { msg: "{link} {n, plural, other {# left}}" });

    expect(i18n.t("msg", { link: handler, n: 2 })).toBe("{link} 2 left");
  });

  it("drop → an empty string", () => {
    const i18n = makeFull("drop", { msg: "See {link}." });

    expect(i18n.t("msg", { link: handler })).toBe("See .");
  });

  it("the same function as the handler of a real tag → still called", () => {
    const i18n = makeFull(undefined, { msg: "<link>docs</link> and {link}" });

    expect(i18n.t("msg", { link: handler })).toBe("[docs] and {link}");
  });

  it("warns once, naming the function rather than calling the parameter missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { msg: "See {link}." });

    i18n.t("msg", { link: handler });
    i18n.t("msg", { link: handler });

    expect(warn.mock.calls).toEqual([
      [
        '[@comvi/core] Parameter "link" for template "See {link}." is a function, and a placeholder renders text. Call it and pass the result, or write <link>…</link> to use it as a tag handler.',
      ],
    ]);
  });

  it("an absent parameter in the same template → still the missing-parameter warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { msg: "See {link}." });

    i18n.t("msg", {});

    expect(warn.mock.calls).toEqual([
      ['[@comvi/core] Missing parameter "link" for template "See {link}."'],
    ]);
  });

  it("an inherited member nobody passed → still the missing-parameter warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { msg: "See {constructor}." });

    i18n.t("msg", {});

    expect(warn.mock.calls).toEqual([
      ['[@comvi/core] Missing parameter "constructor" for template "See {constructor}."'],
    ]);
  });

  it("an object param → still coerced with String()", () => {
    const i18n = makeFull(undefined, { msg: "See {link}." });

    expect(i18n.t("msg", { link: { toString: () => "the docs" } } as Params)).toBe("See the docs.");
  });

  // The two warnings are different advice, so one must not use up the other's
  // once-per-(template, parameter) allowance — in either order.
  const MISSING = '[@comvi/core] Missing parameter "link" for template "See {link}."';
  const IS_FUNCTION =
    '[@comvi/core] Parameter "link" for template "See {link}." is a function, and a placeholder renders text. Call it and pass the result, or write <link>…</link> to use it as a tag handler.';

  it("absent first, then a function → both warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { msg: "See {link}." });

    i18n.t("msg", {});
    i18n.t("msg", { link: handler });

    expect(warn.mock.calls).toEqual([[MISSING], [IS_FUNCTION]]);
  });

  it("a function first, then absent → both warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { msg: "See {link}." });

    i18n.t("msg", { link: handler });
    i18n.t("msg", {});

    expect(warn.mock.calls).toEqual([[IS_FUNCTION], [MISSING]]);
  });

  it("a getter that answers undefined, then a function → read once, warned as missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeFull(undefined, { msg: "See {link}." });
    let reads = 0;
    const params = {
      get link() {
        return reads++ === 0 ? undefined : handler;
      },
    };

    const rendered = i18n.t("msg", params as Params);

    expect(rendered).toBe("See {link}.");
    expect(reads).toBe(1);
    expect(warn.mock.calls).toEqual([[MISSING]]);
  });

  it.each([
    { given: "a plural", msg: "{n, plural, other {# for {link}}}", expected: "2 for {link}" },
    { given: "a select", msg: "{kind, select, other {see {link}}}", expected: "see {link}" },
  ])("a function inside the selected branch of $given → the literal placeholder", (row) => {
    const i18n = makeFull(undefined, { msg: row.msg });

    expect(i18n.t("msg", { n: 2, kind: "x", link: handler })).toBe(row.expected);
  });

  it.each([
    { given: "a plural", msg: "{n, plural, other {# for {link}}}", expected: "2 for {link}" },
    { given: "a select", msg: "{kind, select, other {see {link}}}", expected: "see {link}" },
  ])(
    "an absent parameter inside the selected branch of $given → the literal placeholder",
    (row) => {
      const i18n = makeFull(undefined, { msg: row.msg });

      expect(i18n.t("msg", { n: 2, kind: "x" })).toBe(row.expected);
    },
  );
});
