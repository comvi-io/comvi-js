import { describe, it, expect, beforeEach } from "vitest";
// IMPORTANT: this file never imports the tags entry or the internal composite,
// so no ambient tag registration and no ICU wiring happen behind its back.
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/icu";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions, getAmbientExtensions } from "../../src/core/translate/syntax";
// The pure extension object, NOT `../../src/tags` — that entry registers
// ambiently on import and would defeat the point of this file.
import { tagSyntaxExtension } from "../../src/core/translate/tags";
import { flattenCatalog } from "../../src/loader";

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("@comvi/core", () => {
  it("does not register any ambient syntax extension", () => {
    expect(getAmbientExtensions().length).toBe(0);
  });

  it("interpolates {param} like the composed host", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greet: "Hello, {name}!", plain: "Just text" } },
    });
    expect(i18n.t("greet" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
    expect(i18n.t("plain" as never)).toBe("Just text");
  });

  // ICU argument syntax on the default compiler is fatal in DEVELOPMENT (this
  // suite runs with `__DEV__` true): ingestion is the dev-eager seam, so the
  // throw arrives at CONSTRUCTION, not at first render. Production instead
  // renders the segment literally and reports through `onError` — only the dist
  // suite can observe that half, because only there is the `__DEV__` fold real.
  it("throws E_ICU_SYNTAX on ICU argument syntax instead of rendering it literally", () => {
    const template = "{count, plural, one {# item} other {# items}}";

    let thrown: unknown;
    try {
      createI18n({ locale: "en", translation: { en: { items: template } } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
    expect((thrown as { argumentType?: unknown }).argumentType).toBe("plural");
    expect((thrown as Error).message).toContain("@comvi/core/icu");
  });

  it("renders <tag> markup literally (no tag graph on the base host)", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "<link>hi</link>" } },
    });
    expect(i18n.t("msg" as never)).toBe("<link>hi</link>");
  });

  it("injected icuCompiler (from @comvi/core/icu) restores plural behavior", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });
    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 5 } as never)).toBe("5 items");
  });

  // Tag-grammar escapes are TAGS-ONLY: `<`, `&` and `\` are offered to the
  // effective extension set, and with no tag extension in the graph there is no
  // `<` grammar to escape from, so the sequences stay literal content.
  it("leaves &lt; / &gt; / &amp; and \\< literal with no tag extension", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: {
          entities: "a &lt;b&gt; &amp; c",
          escape: "Use \\<div>",
        },
      },
    });

    expect(i18n.t("entities" as never)).toBe("a &lt;b&gt; &amp; c");
    expect(i18n.t("escape" as never)).toBe("Use \\<div>");
  });

  it("decodes those same sequences as soon as the tag extension is supplied", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: {
          entities: "a &lt;b&gt; &amp; c",
          escape: "Use \\<div>",
        },
      },
    });
    const tagInterpolation = { extensions: [tagSyntaxExtension] };

    expect(i18n.t("entities" as never, { tagInterpolation } as never)).toBe("a <b> & c");
    expect(i18n.t("escape" as never, { tagInterpolation } as never)).toBe("Use <div>");
  });

  // ICU apostrophe quoting STAYS in the core grammar — only the tag-grammar
  // escapes moved out. This is the regression guard for that decision.
  it("still applies ICU '' apostrophe quoting with no extension at all", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: {
          quoted: "'{literal}' stays",
          doubled: "it''s here",
          plain: "Superiors' behavior",
        },
      },
    });

    expect(i18n.t("quoted" as never)).toBe("{literal} stays");
    expect(i18n.t("doubled" as never)).toBe("it's here");
    expect(i18n.t("plain" as never)).toBe("Superiors' behavior");
  });

  // Nested-catalog flattening is a capability, not base behaviour.
  describe("addTranslations on a bare host", () => {
    it("stores a FLAT catalog, including colon-keyed namespaces", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addTranslations({
        en: { "nav.home": "Home" },
        "en:admin": { "nav.home": "Admin home" },
      });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      expect(i18n.t("nav.home" as never, { ns: "admin" } as never)).toBe("Admin home");
      expect(i18n.getActiveNamespaces().sort()).toEqual(["admin", "default"]);
    });

    it("merges repeated adds for the same locale/namespace", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addTranslations({ en: { a: "A" } });
      i18n.addTranslations({ en: { b: "B", a: "A2" } });

      expect(i18n.t("a" as never)).toBe("A2");
      expect(i18n.t("b" as never)).toBe("B");
    });

    it("keeps a raw user object's prototype members out of lookups", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addTranslations({ en: { real: "Real" } });

      // The catalog the caller passed has Object.prototype; the cache copy
      // must not, or `toString` would resolve as a translation.
      expect(i18n.hasTranslation("toString")).toBe(false);
      expect(i18n.t("toString" as never)).toBe("toString");
      expect(Object.getPrototypeOf(i18n.getTranslations())).toBeNull();
    });

    it("does NOT flatten a nested catalog, and says so in dev", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const i18n = createI18n({ locale: "en" });

      i18n.addTranslations({ en: { nav: { home: "Home" } } as never });

      expect(i18n.hasTranslation("nav.home")).toBe(false);
      expect(warnSpy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("flattenCatalog()");
      warnSpy.mockRestore();
    });

    it("accepts a nested catalog wrapped in flattenCatalog()", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" }, count: 3 }) });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      // Non-string leaves are coerced, exactly as on the loader path.
      expect(i18n.t("count" as never)).toBe("3");
    });
  });
});
