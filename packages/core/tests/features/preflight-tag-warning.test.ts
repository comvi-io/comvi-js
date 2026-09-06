/**
 * The ingestion preflight and the unclaimed-tag warning.
 *
 * The dev preflight parses every ingested catalog string with the HOST's
 * effective extensions so the compiler's `E_ICU_SYNTAX` lands where the catalog
 * entered. It must NOT carry the unclaimed-tag warning with it: whether a `<b>`
 * in the catalog is a mistake depends on how the string is rendered, and an app
 * whose `<T>` supplies the tag grammar per call registers nothing on the host
 * and renders it correctly. Worse, the warning dedupes per template, so an
 * ingestion-time warning PRE-EMPTS the truthful one the render path would emit.
 *
 * Pinned here: ingestion is silent (top level and inside ICU branches) while
 * every render path keeps the warning it already had.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
// The BASE host: simple compiler, no ambient tag extension — the app shape the
// false positive was reported from.
import { createI18n } from "../../src";
// The composed host reached WITHOUT `register-tags`: the ICU compiler on a
// registry that still claims no `<`, which is what makes the branch walk
// observable.
import { I18n as IcuI18n } from "../../src/core/full";
import { prepareTranslation } from "../../src/rich-text";
import { _resetSyntaxExtensions, registerSyntaxExtension } from "../../src/core/translate/syntax";
import { tagSyntaxExtension } from "../../src/core/translate/tags";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetTagWarnings } from "../../src/core/translate/parser";

const GREET = "Hi <b>{name}</b>";
const ATTR_TEMPLATE = 'see <a href="x">docs</a>';
const PLURAL = "{n, plural, one {<b>#</b> item} other {<b>#</b> items}}";

const NO_EXTENSION_WARNING =
  `[i18n] Tag syntax in "${GREET}" is rendering as literal text: no tag extension claims "<". ` +
  `Render it with your framework's <T> component, or import "@comvi/core/tags" to register tag ` +
  `syntax for the string API.`;

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
  // The dedupe set is module-global; without this reset a second use of a
  // template in this file would silently expect zero warnings.
  _resetTagWarnings();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("catalog ingestion — the dev preflight", () => {
  it("stays silent for tag markup a host with no tag extension ingests", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    i18n.addTranslations({ en: { greet: GREET } });

    expect(tagWarnings()).toEqual([]);
  });

  it("stays silent for tag markup inside an ICU plural branch", () => {
    // Branch text is stored verbatim and parsed by the preflight's own walk, a
    // second parse the top-level call cannot speak for.
    const i18n = new IcuI18n({ locale: "en", exposeGlobal: false });

    i18n.addTranslations({ en: { items: PLURAL } });

    expect(tagWarnings()).toEqual([]);
  });
});

describe("rendering an ingested tag template — the dev warning", () => {
  it("warns once through `t()` on a host with no tag extension", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greet: GREET } },
    });
    // Ingestion has happened; anything the spy holds from here is the RENDER
    // path's, which is the whole distinction under test.
    warnSpy.mockClear();

    const rendered = i18n.t("greet" as never, { name: "Ada" } as never);

    expect(rendered).toBe("Hi <b>Ada</b>");
    expect(tagWarnings()).toEqual([NO_EXTENSION_WARNING]);
  });

  it("warns about unsupported attributes through `t()` on a host with tag syntax", () => {
    registerSyntaxExtension(tagSyntaxExtension);
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { docs: ATTR_TEMPLATE } },
    });
    warnSpy.mockClear();

    const rendered = i18n.t("docs" as never);

    expect(rendered).toBe(ATTR_TEMPLATE);
    expect(tagWarnings()).toEqual([
      `[i18n] Tag syntax in "${ATTR_TEMPLATE}" is rendering as literal text: attributes are not ` +
        "supported in tag syntax; pass them via the `components` config " +
        '(`{ tag: "a", props: { href } }`).',
    ]);
  });

  it("warns once through `t()` for a tag inside an ICU plural branch", () => {
    const i18n = new IcuI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { items: PLURAL } },
    });
    warnSpy.mockClear();

    const rendered = i18n.t("items" as never, { n: 1 } as never);

    expect(rendered).toBe("<b>1</b> item");
    expect(tagWarnings()).toEqual([
      `[i18n] Tag syntax in "<b>#</b> item" is rendering as literal text: no tag extension ` +
        `claims "<". Render it with your framework's <T> component, or import ` +
        `"@comvi/core/tags" to register tag syntax for the string API.`,
    ]);
  });

  it("stays silent through `prepareTranslation`, which carries the tag grammar per call", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greet: GREET } },
    });

    const prepared = prepareTranslation(i18n, {
      i18nKey: "greet",
      params: { name: "Ada" },
      components: { b: "strong" },
    });

    expect(prepared.content).toEqual([
      "Hi ",
      { type: "element", tag: "strong", props: {}, children: ["Ada"] },
    ]);
    expect(tagWarnings()).toEqual([]);
  });
});
