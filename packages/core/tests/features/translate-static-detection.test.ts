import { describe, it, expect, beforeEach, vi } from "vitest";
import { createI18n } from "../../src";
import { createI18n as createFullI18n } from "../../src/core/full";
import { clearTemplateCache, isStaticTemplate } from "../../src/core/translate";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import {
  _resetSyntaxExtensions,
  effectiveExtBits,
  getCompilerId,
} from "../../src/core/translate/syntax";

// `isStatic` gates the fast path that returns the RAW template, so a template whose parse
// collapses quoting must never be marked static (keying is pinned by compiler-isolation).

const baseVariant = () => [getCompilerId(simpleCompiler), effectiveExtBits()] as const;

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("isStaticTemplate()", () => {
  it("is undefined for a template variant that has not been compiled yet", () => {
    const [compilerId, extBits] = baseVariant();

    expect(isStaticTemplate("Tom & Jerry", false, compilerId, extBits)).toBeUndefined();
  });

  it("marks a text-only template that renders byte-equal to its source as static", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { amp: "Tom & Jerry" } } });
    const [compilerId, extBits] = baseVariant();
    i18n.t("amp" as never);

    const isStatic = isStaticTemplate("Tom & Jerry", false, compilerId, extBits);

    expect(isStatic).toBe(true);
  });

  it("does not mark a quote-collapsing template as static, so a repeat render stays rendered", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { quoted: "Tom''s" } } });
    const [compilerId, extBits] = baseVariant();

    expect(i18n.t("quoted" as never)).toBe("Tom's");

    expect(isStaticTemplate("Tom''s", false, compilerId, extBits)).toBe(false);
    expect(i18n.t("quoted" as never)).toBe("Tom's");
  });

  it("does not mark a parametrized template as static", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { greet: "Hi {name}" } } });
    const [compilerId, extBits] = baseVariant();
    i18n.t("greet" as never, { name: "Ann" } as never);

    const isStatic = isStaticTemplate("Hi {name}", false, compilerId, extBits);

    expect(isStatic).toBe(false);
  });
});

describe("a template made only of markup characters", () => {
  // `<` and `&` are what the special-character scan looks for; when it misses
  // them the template is cached as an empty token list, which only a SECOND
  // entry point — the per-call fallback — renders differently.
  it.each([
    ["less-than", "<"],
    ["ampersand", "&"],
  ])(
    "a per-call fallback equal to an already-rendered %s template still renders",
    (key, template) => {
      const i18n = createI18n({ locale: "en", translation: { en: { [key]: template } } });
      i18n.t(key as never);

      const fallback = i18n.t("absent" as never, { fallback: template } as never);

      expect(fallback).toBe(template);
    },
  );
});

describe("t() — a lone opening brace", () => {
  it("renders literally and warns that the braces are unbalanced", () => {
    // The ICU host, whose catalogs skip the simple-compiler ingestion
    // preflight: the warning below can only come from the render-time parse.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createFullI18n({ locale: "en", translation: { en: { brace: "{" } } });

    expect(i18n.t("brace")).toBe("{");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unbalanced braces"));
  });
});
