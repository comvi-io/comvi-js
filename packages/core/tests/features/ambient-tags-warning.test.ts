import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The BASE host: no tag extension in the graph, which is the whole subject.
import { createI18n } from "../../src";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions, registerSyntaxExtension } from "../../src/core/translate/syntax";
import { tagSyntaxExtension } from "../../src/core/translate/tags";

/**
 * The ambient string-API tag residual.
 *
 * `t("click <b>here</b>")` with no tag extension in the graph renders the markup
 * as literal text, in development AND production — unlike an ICU plural, which
 * reads plausible and is therefore a throw, a literal `<b>` is visibly broken in
 * any UI review.
 *
 * Pinned here: the warning fires once per template, only for genuinely tag-like
 * input, never inside a quoted section, and never when a real tag extension
 * claims `<`. The production side is pinned on the built artifacts.
 */

let caseId = 0;
/** A fresh tag template per case: the dedupe is module-global by design. */
function tagTemplate(): string {
  return `click <b>here</b> now #${++caseId}`;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

/** Warnings this file is about — never the missing-param or flat-catalog ones. */
function tagWarnings(): string[] {
  return warnSpy.mock.calls
    .map((call) => (typeof call[0] === "string" ? call[0] : ""))
    .filter((message) => message.includes("rendering as literal text"));
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("unclaimed tag syntax — the development warning", () => {
  it("warns ONCE per template and names both fixes", () => {
    const template = tagTemplate();
    const i18n = createI18n({ locale: "en", translation: { en: { rich: template } } });

    expect(i18n.t("rich" as never)).toBe(template);
    i18n.t("rich" as never);
    i18n.t("rich" as never);

    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    // BOTH prescribed fixes: which one applies depends on whether the caller is
    // rendering a component or a string.
    expect(warnings[0]).toContain("<T>");
    expect(warnings[0]).toContain("@comvi/core/tags");
    expect(warnings[0]).toContain(template);
  });

  it("warns per TEMPLATE, not per instance or per key", () => {
    const template = tagTemplate();
    const first = createI18n({ locale: "en", translation: { en: { a: template } } });
    const second = createI18n({ locale: "en", translation: { en: { b: template } } });

    first.t("a" as never);
    second.t("b" as never);
    expect(tagWarnings()).toHaveLength(1);

    // A DIFFERENT template warns again — the dedupe is not a global latch.
    second.addTranslations({ en: { c: `read <strong>this</strong> #${caseId}` } });
    second.t("c" as never);
    expect(tagWarnings()).toHaveLength(2);
  });

  it("stays silent for a `<` that is not tag-like", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: {
          math: "a < b and c > d",
          spaced: "1 < 2",
          closing: "</ orphan",
          entity: "&lt; stays literal",
        },
      },
    });

    for (const key of ["math", "spaced", "closing", "entity"]) i18n.t(key as never);

    expect(tagWarnings()).toEqual([]);
    expect(i18n.t("math" as never)).toBe("a < b and c > d");
    expect(i18n.t("entity" as never)).toBe("&lt; stays literal");
  });

  it("stays silent inside a quoted section", () => {
    // Apostrophe quoting starts before a syntax character (`{`), and everything
    // up to the closing apostrophe is literal — including the `<`.
    const i18n = createI18n({
      locale: "en",
      translation: { en: { quoted: "'{count} <b>literal</b>'" } },
    });

    expect(i18n.t("quoted" as never)).toBe("{count} <b>literal</b>");
    expect(tagWarnings()).toEqual([]);
  });

  it("stays silent when a real tag extension claims `<`", () => {
    // The extension claims the position, so the parser never reaches the
    // unclaimed branch the warning lives in.
    registerSyntaxExtension(tagSyntaxExtension);
    const template = tagTemplate();
    const i18n = createI18n({ locale: "en", translation: { en: { rich: template } } });

    // The markup is GONE from the output — proof the extension claimed `<`
    // rather than the warning branch seeing it.
    const rendered = i18n.t(
      "rich" as never,
      { b: ({ children }: { children: string }) => children } as never,
    );
    expect(rendered).not.toContain("<b>");
    expect(rendered).toContain("here");
    expect(tagWarnings()).toEqual([]);
  });

  it("stays silent when the extension arrives per call instead of ambiently", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { rich: tagTemplate() } },
      tagInterpolation: { extensions: [tagSyntaxExtension] },
    });

    i18n.t("rich" as never, { b: ({ children }: { children: string }) => children } as never);
    expect(tagWarnings()).toEqual([]);
  });
});
