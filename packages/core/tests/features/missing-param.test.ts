import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported directly rather than
// through the tags-registering helper.
import { createI18n } from "../../src/core/full";
import { createI18n as createBaseI18n } from "../../src";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";
import { registerTagSyntax } from "../../src/core/translate/tags";
import type { ElementNode } from "../../src";

// Importing the composite registered tag syntax AMBIENTLY (the base root
// registers nothing), which the tag path below relies on. Reset the template
// cache so variants never leak between cases.
beforeEach(() => {
  clearTemplateCache();
  registerTagSyntax();
});

afterEach(() => {
  _resetSyntaxExtensions();
  registerTagSyntax();
});

type Mode = "literal" | "drop";

function makeFull(mode?: Mode, translations?: Record<string, string>) {
  return createI18n({
    locale: "en",
    ...(mode ? { missingParam: mode } : {}),
    translation: { en: translations ?? {} },
  });
}

describe("missingParam — path 1: single-param fast path", () => {
  const translations = { greet: "Hello, {name}!" };

  it("literal (default): absent/undefined render the placeholder, null renders empty", () => {
    const i18n = makeFull(undefined, translations);
    expect(i18n.t("greet")).toBe("Hello, {name}!");
    expect(i18n.t("greet", {})).toBe("Hello, {name}!");
    expect(i18n.t("greet", { name: undefined })).toBe("Hello, {name}!");
    expect(i18n.t("greet", { name: null })).toBe("Hello, !");
  });

  it("drop: absent/undefined/null all render empty (0.4.0 behavior)", () => {
    const i18n = makeFull("drop", translations);
    expect(i18n.t("greet", {})).toBe("Hello, !");
    expect(i18n.t("greet", { name: undefined })).toBe("Hello, !");
    expect(i18n.t("greet", { name: null })).toBe("Hello, !");
  });
});

describe("missingParam — path 2: simple-params fast path (multiple params)", () => {
  const translations = { pair: "{a} and {b}" };

  it("literal: only the missing param renders as placeholder", () => {
    const i18n = makeFull(undefined, translations);
    expect(i18n.t("pair", { a: "left" })).toBe("left and {b}");
    expect(i18n.t("pair", { a: "left", b: null })).toBe("left and ");
  });

  it("drop: missing param renders empty", () => {
    const i18n = makeFull("drop", translations);
    expect(i18n.t("pair", { a: "left" })).toBe("left and ");
    expect(i18n.t("pair", { a: "left", b: null })).toBe("left and ");
  });
});

describe("missingParam — path 3: full token pipeline (template with ICU)", () => {
  const translations = { msg: "{count, plural, one {# file} other {# files}} for {name}" };

  it("literal: missing param inside a complex template renders the placeholder", () => {
    const i18n = makeFull(undefined, translations);
    expect(i18n.t("msg", { count: 2 })).toBe("2 files for {name}");
    expect(i18n.t("msg", { count: 2, name: null })).toBe("2 files for ");
  });

  it("drop: missing param renders empty", () => {
    const i18n = makeFull("drop", translations);
    expect(i18n.t("msg", { count: 2 })).toBe("2 files for ");
    expect(i18n.t("msg", { count: 2, name: null })).toBe("2 files for ");
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
    const node = (Array.isArray(result) ? result[0] : result) as ElementNode;
    expect(node.type).toBe("element");
    expect(node.children).toEqual(["{name}"]);
  });

  it("drop: missing param inside tag children renders nothing", () => {
    const i18n = createI18n({
      locale: "en",
      missingParam: "drop",
      translation: { en: translations },
      tagInterpolation: { basicHtmlTags: ["strong"] },
    });
    const result = i18n.tRaw("msg");
    const node = (Array.isArray(result) ? result[0] : result) as ElementNode;
    expect(node.type).toBe("element");
    expect(node.children).toEqual([]);
  });
});

describe("missingParam — path 5: slim compiler", () => {
  it("literal (default) and null erasure behave like the full entry", () => {
    const i18n = createBaseI18n({
      locale: "en",
      translation: { en: { greet: "Hi {name}!" } },
    });
    expect(i18n.t("greet" as never, {} as never)).toBe("Hi {name}!");
    expect(i18n.t("greet" as never, { name: null } as never)).toBe("Hi !");
  });

  it("drop restores silent-drop", () => {
    const i18n = createBaseI18n({
      locale: "en",
      missingParam: "drop",
      translation: { en: { greet: "Hi {name}!" } },
    });
    expect(i18n.t("greet" as never, {} as never)).toBe("Hi !");
  });
});

describe("missingParam — dev warning", () => {
  it("warns once per (template, param) pair", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Unique template so the module-level dedup set cannot have seen it.
    const template = `Warn check {missing_${Date.now()}}`;
    const paramName = template.slice(template.indexOf("{") + 1, template.indexOf("}"));
    const i18n = makeFull(undefined, { warned: template });

    i18n.t("warned");
    i18n.t("warned");

    const matching = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes(`Missing parameter "${paramName}"`),
    );
    expect(matching.length).toBe(1);
    warnSpy.mockRestore();
  });
});
