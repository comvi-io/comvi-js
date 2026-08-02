import { describe, it, expect, vi, beforeEach } from "vitest";
// IMPORTANT: this file never imports "../../src" (the root entry), so no
// ambient tag registration and no ICU wiring happen behind its back.
import { createI18n } from "../../src/slim";
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

describe("@comvi/core/slim", () => {
  it("does not register any ambient syntax extension", () => {
    expect(getAmbientExtensions().length).toBe(0);
  });

  it("interpolates {param} like the full entry", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greet: "Hello, {name}!", plain: "Just text" } },
    });
    expect(i18n.t("greet" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
    expect(i18n.t("plain" as never)).toBe("Just text");
  });

  it("passes ICU templates through literally and warns once per template in dev", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const template = `{count_${Date.now()}, plural, one {# item} other {# items}}`;
    const i18n = createI18n({
      locale: "en",
      translation: { en: { items: template } },
    });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe(template);
    i18n.t("items" as never, { count: 3 } as never);

    const matching = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("ICU syntax detected"),
    );
    expect(matching.length).toBe(1);
    expect(matching[0][0]).toContain("@comvi/core/icu");
    warnSpy.mockRestore();
  });

  it("renders <tag> markup literally (no tag graph in slim)", () => {
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

  // ── tag-grammar escapes are tags-only (framework-slim tier-3, C5a) ──
  // `<`, `&` and `\` are offered to the effective extension set; with no tag
  // extension in the graph there is no `<` grammar, so there is nothing to
  // escape from and the sequences are literal content.
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

  // ── ICU apostrophe quoting STAYS in the core grammar (C5b NOT extracted) ──
  // It is live, documented bare-slim behavior; only the tag-grammar escapes
  // moved. This is the regression guard for that decision.
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

  // ── nested-catalog flattening is a capability (tier-3, C6) ──
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
