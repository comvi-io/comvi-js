import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported directly rather than
// through the tags-registering helper.
import { createI18n } from "../../src/core/full";
import { createI18n as createBaseI18n } from "../../src";
import { clearTemplateCache, _resetMissingParamWarnings } from "../../src/core/translate";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";
import { registerTagSyntax } from "../../src/core/translate/tags";

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
type Params = Record<string, unknown> | undefined;

function makeFull(mode?: Mode, translations?: Record<string, string>) {
  return createI18n({
    locale: "en",
    ...(mode ? { missingParam: mode } : {}),
    translation: { en: translations ?? {} },
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
      translation: { en: translations },
      tagInterpolation: { basicHtmlTags: ["strong"] },
    });

    const result = i18n.tRaw("msg");

    expect(result).toEqual([{ type: "element", tag: "strong", props: {}, children: ["{name}"] }]);
  });

  it("drop: missing param inside tag children renders nothing", () => {
    const i18n = createI18n({
      locale: "en",
      missingParam: "drop",
      translation: { en: translations },
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
      translation: { en: { greet: "Hi {name}!" } },
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
      '[i18n] Missing parameter "missingName" for template "Warn check {missingName}"',
    );
  });
});
