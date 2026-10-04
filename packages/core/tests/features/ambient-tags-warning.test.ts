import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
// The BASE host: no tag extension in the graph, which is the whole subject.
import { createI18n } from "../../src";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions, registerSyntaxExtension } from "../../src/core/translate/syntax";
import { _resetTagWarnings } from "../../src/core/translate/parser";
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

const TAG_TEMPLATE = "click <b>here</b> now";
const OTHER_TAG_TEMPLATE = "read <i>this</i> too";

let warnSpy: MockInstance<typeof console.warn>;

/** Warnings this file is about — never the missing-param or flat-catalog ones. */
function tagWarnings(): string[] {
  return warnSpy.mock.calls
    .map((call) => (typeof call[0] === "string" ? call[0] : ""))
    .filter((message) => message.includes("rendering as literal text"));
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
  // The dedupe set is module-global; without this reset the second file-level
  // use of a template would silently expect zero warnings.
  _resetTagWarnings();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("unclaimed tag syntax — the development warning", () => {
  it("warns ONCE per template and names both fixes", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { rich: TAG_TEMPLATE } } });

    const first = i18n.t("rich" as never);
    i18n.t("rich" as never);
    const third = i18n.t("rich" as never);

    expect(first).toBe(TAG_TEMPLATE);
    expect(third).toBe(TAG_TEMPLATE);
    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    // BOTH prescribed fixes: which one applies depends on whether the caller is
    // rendering a component or a string.
    expect(warnings[0]).toContain("<T>");
    expect(warnings[0]).toContain("@comvi/core/tags");
    expect(warnings[0]).toContain(TAG_TEMPLATE);
  });

  it("warns per TEMPLATE, not per instance or per key", () => {
    const first = createI18n({ locale: "en", messages: { en: { a: TAG_TEMPLATE } } });
    const second = createI18n({ locale: "en", messages: { en: { b: TAG_TEMPLATE } } });

    first.t("a" as never);
    second.t("b" as never);
    expect(tagWarnings()).toHaveLength(1);

    // A DIFFERENT template warns again — the dedupe is not a global latch.
    second.addMessages({ en: { c: OTHER_TAG_TEMPLATE } });
    second.t("c" as never);
    expect(tagWarnings()).toHaveLength(2);
  });

  it.each([
    ["math", "a < b and c > d"],
    ["spaced", "1 < 2"],
    ["closing", "</ orphan"],
    ["entity", "&lt; stays literal"],
  ])("stays silent for a `<` that is not tag-like: %s", (key, template) => {
    const i18n = createI18n({ locale: "en", messages: { en: { [key]: template } } });

    const rendered = i18n.t(key as never);

    expect(rendered).toBe(template);
    expect(tagWarnings()).toEqual([]);
  });

  it.each([
    ["A", " <Alpha tail"],
    ["Z", " <Zulu tail"],
    ["a", " <alpha tail"],
    ["z", " <zulu tail"],
  ])("warns for a `<` followed by ASCII letter %s", (letter, template) => {
    const i18n = createI18n({ locale: "en", messages: { en: { [letter]: template } } });

    i18n.t(letter as never);

    expect(tagWarnings()).toHaveLength(1);
  });

  it.each([
    ["@ — one below A", "at", "y<@ tail"],
    ["[ — one above Z", "bracket", "y<[ tail"],
    ["` — one below a", "backtick", "y<` tail"],
    ["~ — above z", "tilde", "y<~ tail"],
    ["a digit", "digit", "y<1 tail"],
    ["the end of the template", "eot", "tail y<"],
  ])("stays silent for a `<` followed by %s", (_label, key, template) => {
    const i18n = createI18n({ locale: "en", messages: { en: { [key]: template } } });

    const rendered = i18n.t(key as never);

    expect(rendered).toBe(template);
    expect(tagWarnings()).toEqual([]);
  });

  it("stays silent inside a quoted section", () => {
    // Apostrophe quoting starts before a syntax character (`{`), and everything
    // up to the closing apostrophe is literal — including the `<`.
    const i18n = createI18n({
      locale: "en",
      messages: { en: { quoted: "'{count} <b>literal</b>'" } },
    });

    expect(i18n.t("quoted" as never)).toBe("{count} <b>literal</b>");
    expect(tagWarnings()).toEqual([]);
  });

  it("stays silent when a real tag extension claims `<`", () => {
    // The extension claims the position, so the parser never reaches the
    // unclaimed branch the warning lives in.
    registerSyntaxExtension(tagSyntaxExtension);
    const i18n = createI18n({ locale: "en", messages: { en: { rich: TAG_TEMPLATE } } });

    const rendered = i18n.t(
      "rich" as never,
      { b: ({ children }: { children: string }) => children } as never,
    );

    // The markup is GONE from the output — proof the extension claimed `<`
    // rather than the warning branch seeing it.
    expect(rendered).toBe("click here now");
    expect(tagWarnings()).toEqual([]);
  });

  it("stays silent when the extension arrives per call instead of ambiently", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { rich: TAG_TEMPLATE } },
      tagInterpolation: { extensions: [tagSyntaxExtension] },
    });

    i18n.t("rich" as never, { b: ({ children }: { children: string }) => children } as never);

    expect(tagWarnings()).toEqual([]);
  });
});

describe("a tag the extension recognises but refuses — the development warning", () => {
  const ATTR_TEMPLATE = 'see <a href="/x">docs</a>';

  it("tells an app that already registered tag syntax that attributes are unsupported", () => {
    registerSyntaxExtension(tagSyntaxExtension);
    const i18n = createI18n({ locale: "en", messages: { en: { link: ATTR_TEMPLATE } } });

    const rendered = i18n.t("link" as never);

    expect(rendered).toBe(ATTR_TEMPLATE);
    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("attributes are not supported in tag syntax");
    expect(warnings[0]).toContain("components");
    // The old advice is actively wrong here: the module is already imported.
    expect(warnings[0]).not.toContain("@comvi/core/tags");
  });

  it("still tells an app with no tag extension to import the module", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { link: ATTR_TEMPLATE } } });

    i18n.t("link" as never);

    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe(
      `[i18n] Tag syntax in "${ATTR_TEMPLATE}" is rendering as literal text: no tag extension ` +
        `claims "<". Render it with your framework's <T> component, or import ` +
        `"@comvi/core/tags" to register tag syntax for the string API.`,
    );
  });

  it("keeps the plain-tag advice when an extension other than tags is registered", () => {
    // Only the built-in tag extension implies "the tag was recognised and
    // refused"; an unrelated extension leaving `<` alone means what it always
    // meant, so the message must not change.
    registerSyntaxExtension({
      id: "comvi:not-tags",
      cacheBit: 2,
      parseHook: () => undefined,
      processHook: () => undefined,
    });
    const i18n = createI18n({ locale: "en", messages: { en: { link: ATTR_TEMPLATE } } });

    i18n.t("link" as never);

    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("@comvi/core/tags");
  });

  // Every row is a tag `parseTag` refuses for a reason that is NOT an attribute,
  // so the message must stay the generic one. Together they pin each character
  // class the attribute probe walks past: the tag-name alphabet, the whitespace
  // before `>`, a `/`, and the end of the template.
  it.each([
    ["a lowercase name", "lower", "an <b>unclosed tag"],
    ["an uppercase name", "upper", "an <B>unclosed tag"],
    ["a name with a digit", "digit", "an <b1>unclosed tag"],
    ["a name with a hyphen", "hyphen", "an <b-x>unclosed tag"],
    ["a name with an underscore", "underscore", "an <b_x>unclosed tag"],
    ["whitespace before the >", "spaced", "an <b >unclosed tag"],
    ["a slash that opens no self-closing tag", "slash", "an <b/x tail"],
    ["a tag name that ends the template", "eot", "tail <b"],
    // One row per inclusive edge of the three ranges the name scan accepts:
    // A-Z, a-z and 0-9. Narrowing any edge by one leaves that character outside
    // the name, which ends the scan early and reports it as an attribute.
    ["A, the first uppercase name char", "edgeA", "an <bA>unclosed tag"],
    ["Z, the last uppercase name char", "edgeZ", "an <bZ>unclosed tag"],
    ["a, the first lowercase name char", "edgea", "an <ba>unclosed tag"],
    ["z, the last lowercase name char", "edgez", "an <bz>unclosed tag"],
    ["0, the first digit name char", "edge0", "an <b0>unclosed tag"],
    ["9, the last digit name char", "edge9", "an <b9>unclosed tag"],
  ])("keeps the plain-tag advice for %s", (_label, key, template) => {
    registerSyntaxExtension(tagSyntaxExtension);
    const i18n = createI18n({ locale: "en", messages: { en: { [key]: template } } });

    i18n.t(key as never);

    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("@comvi/core/tags");
  });

  // The other side of the same three ranges: one character below A, above Z,
  // below a, above z, below 0 and above 9. Each must END the tag name, so what
  // follows is read as an attribute. Widening an edge by one would swallow the
  // character into the name and change the message.
  it.each([
    ["@, one below A", "outAtSign", "an <b@x>unclosed tag"],
    ["[, one above Z", "outBracket", "an <b[x>unclosed tag"],
    ["`, one below a", "outBacktick", "an <b`x>unclosed tag"],
    ["{, one above z", "outBrace", "an <b{x>unclosed tag"],
    // `.` rather than `/`, the literal character below `0`: `/` is the
    // self-closing marker and is deliberately NOT read as an attribute.
    [". , below the digits", "outDot", "an <b.x>unclosed tag"],
    [":, one above 9", "outColon", "an <b:x>unclosed tag"],
  ])("reports an attribute for a name ended by %s", (_label, key, template) => {
    registerSyntaxExtension(tagSyntaxExtension);
    const i18n = createI18n({ locale: "en", messages: { en: { [key]: template } } });

    i18n.t(key as never);

    const warnings = tagWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("attributes are not supported in tag syntax");
  });
});
