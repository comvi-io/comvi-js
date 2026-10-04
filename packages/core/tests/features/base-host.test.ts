import { describe, it, expect, beforeEach, vi } from "vitest";
// IMPORTANT: this file never imports the tags entry or the internal composite,
// so no ambient tag registration and no ICU wiring happen behind its back.
import { createI18n, flattenCatalog } from "../../src";
import { icuCompiler } from "../../src/icu";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions, getAmbientExtensions } from "../../src/core/translate/syntax";
// The pure extension object, NOT `../../src/tags` — that entry registers
// ambiently on import and would defeat the point of this file.
import { tagSyntaxExtension } from "../../src/core/translate/tags";

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("createI18n() — the base host", () => {
  it("does not register any ambient syntax extension", () => {
    expect(getAmbientExtensions()).toEqual([]);
  });

  it("interpolates {param} like the composed host", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greet: "Hello, {name}!", plain: "Just text" } },
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
    const construct = () => createI18n({ locale: "en", messages: { en: { items: template } } });

    expect(construct).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
    expect(construct).toThrow(/@comvi\/core\/icu/);
  });

  it("renders <tag> markup literally (no tag graph on the base host)", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { msg: "<link>hi</link>" } },
    });
    expect(i18n.t("msg" as never)).toBe("<link>hi</link>");
  });

  it("injected icuCompiler (from @comvi/core/icu) restores plural behavior", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
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
      messages: {
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
      messages: {
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
      messages: {
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

  // Nested-catalog flattening is BASE behaviour, not a capability (C1).
  describe("addMessages on a bare host", () => {
    it("stores a FLAT catalog, including colon-keyed namespaces", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addMessages({
        en: { "nav.home": "Home" },
        "en:admin": { "nav.home": "Admin home" },
      });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      expect(i18n.t("nav.home" as never, { ns: "admin" } as never)).toBe("Admin home");
      expect(i18n.getActiveNamespaces().sort()).toEqual(["admin", "default"]);
    });

    it("merges repeated adds for the same locale/namespace", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addMessages({ en: { a: "A" } });
      i18n.addMessages({ en: { b: "B", a: "A2" } });

      expect(i18n.t("a" as never)).toBe("A2");
      expect(i18n.t("b" as never)).toBe("B");
    });

    it("keeps a raw user object's prototype members out of lookups", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addMessages({ en: { real: "Real" } });

      // The catalog the caller passed has Object.prototype; the cache copy
      // must not, or `toString` would resolve as a translation.
      expect(i18n.hasTranslation("toString")).toBe(false);
      expect(i18n.t("toString" as never)).toBe("toString");
      expect(Object.getPrototypeOf(i18n.getMessages())).toBeNull();
    });

    it("flattens a nested catalog, with no warning about it", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const i18n = createI18n({ locale: "en" });

      i18n.addMessages({ en: { nav: { home: "Home", deep: { x: "X" } } } as never });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      expect(i18n.t("nav.deep.x" as never)).toBe("X");
      // The old dev warning pointed at `flattenCatalog()` as the escape hatch
      // from a rule that no longer exists; it must not fire at all.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("flattens a nested CONSTRUCTOR catalog — the C1 reproduction", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const i18n = createI18n({ locale: "en", messages: { en: { nav: { home: "Home" } } } });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      expect(i18n.hasTranslation("nav.home")).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("takes a MIXED flat-and-nested catalog in one object", () => {
      const i18n = createI18n({
        locale: "en",
        messages: {
          en: { "nav.home": "Home", nav: { away: "Away" }, plain: "Plain" },
          "en:admin": { panel: { title: "Panel" } },
        },
      });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      expect(i18n.t("nav.away" as never)).toBe("Away");
      expect(i18n.t("plain" as never)).toBe("Plain");
      expect(i18n.t("panel.title" as never, { ns: "admin" } as never)).toBe("Panel");
    });

    it("flattens a nested value holding an ICU plural under compiler: icuCompiler", () => {
      const i18n = createI18n({
        locale: "en",
        compiler: icuCompiler,
        messages: {
          en: { cart: { items: "{count, plural, one {# item} other {# items}}" } },
        },
      });

      expect(i18n.t("cart.items" as never, { count: 1 } as never)).toBe("1 item");
      expect(i18n.t("cart.items" as never, { count: 4 } as never)).toBe("4 items");
    });

    it("keeps prototype-pollution safety through the flattener", () => {
      const hostile = JSON.parse('{"nav":{"home":"Home"},"__proto__":{"polluted":"yes"}}');
      const i18n = createI18n({ locale: "en", messages: { en: hostile } });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      expect(Object.getPrototypeOf(i18n.getMessages())).toBeNull();
      expect(i18n.hasTranslation("toString")).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("still accepts an already-flattened catalog from flattenCatalog()", () => {
      const i18n = createI18n({ locale: "en" });
      i18n.addMessages({ en: flattenCatalog({ nav: { home: "Home" }, count: 3 }) });

      expect(i18n.t("nav.home" as never)).toBe("Home");
      // Non-string leaves are coerced, exactly as on the loader path.
      expect(i18n.t("count" as never)).toBe("3");
    });
  });
});
