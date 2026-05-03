import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n } from "../../src";
import { createI18n } from "../../src";

/**
 * High-signal contract tests for tag interpolation:
 * - parsing + nesting
 * - strict mode behavior
 * - basic HTML whitelist
 * - ICU interactions
 * - malformed templates degrade gracefully
 */
describe("Tag Interpolation", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("parses nested tags and applies handlers", () => {
    i18n.addTranslations({ en: { msg: "Click <a><b>here</b></a>" } });

    const result = i18n.t("msg", {
      a: ({ children }: { children: string }) => `A(${children})`,
      b: ({ children }: { children: string }) => `B(${children})`,
    });

    expect(result).toBe("Click A(B(here))");
  });

  it("handles self-closing tags", () => {
    i18n.addTranslations({ en: { msg: "Line 1<br/>Line 2" } });

    const result = i18n.t("msg", {
      br: () => "\n",
    });

    expect(result).toBe("Line 1\nLine 2");
  });

  it("supports ICU params inside tags", () => {
    i18n.addTranslations({ en: { msg: "<bold>Hello {name}</bold>" } });

    const result = i18n.t("msg", {
      name: "Alice",
      bold: ({ children }: { children: string }) => `**${children}**`,
    });

    expect(result).toBe("**Hello Alice**");
  });

  it("handles tags inside plural expressions", () => {
    i18n.addTranslations({
      en: {
        msg: "{count, plural, one {<b># item</b>} other {<b># items</b>}}",
      },
    });

    const result = i18n.t("msg", {
      count: 5,
      b: ({ children }: { children: string }) => `[${children}]`,
    });

    expect(result).toBe("[5 items]");
  });

  it("escapes backslash and HTML entities", () => {
    i18n.addTranslations({ en: { msg: "Use \\<div> and &lt;span&gt;" } });

    const result = i18n.t("msg");

    expect(result).toBe("Use <div> and <span>");
  });

  it("warns and degrades on malformed tags", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    i18n.addTranslations({ en: { msg: "Click <link>here" } });

    const result = i18n.t("msg");

    expect(result).toBe("Click <link>here");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unclosed tag"));

    warnSpy.mockRestore();
  });

  it("warns and degrades on mismatched nested tags", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    i18n.addTranslations({ en: { msg: "Click <a><b>here</a></b>" } });

    const result = i18n.t("msg");

    expect(result).toBe("Click <a><b>here</a></b>");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Tag mismatch"));

    warnSpy.mockRestore();
  });

  describe("Strict Mode", () => {
    it("falls back to inner text when strict is false", () => {
      const i18nNonStrict = createI18n({
        locale: "en",
        tagInterpolation: { strict: false },
      });
      i18nNonStrict.addTranslations({ en: { msg: "Click <link>here</link>" } });

      const result = i18nNonStrict.t("msg");
      expect(result).toBe("Click here");
    });

    it("warns when strict is 'warn'", () => {
      const onError = vi.fn();
      const i18nWarn = createI18n({
        locale: "en",
        tagInterpolation: { strict: "warn" },
        onError,
      });
      i18nWarn.addTranslations({ en: { msg: "Click <link>here</link>" } });

      const result = i18nWarn.t("msg");

      expect(result).toBe("Click here");
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ source: "translation", tagName: "link" }),
      );
      expect((onError.mock.calls[0][0] as Error).message).toMatch(/missing.*handler.*link/i);
    });

    it("throws when strict is true", () => {
      const i18nStrict = createI18n({
        locale: "en",
        tagInterpolation: { strict: true },
      });
      i18nStrict.addTranslations({ en: { msg: "Click <link>here</link>" } });

      expect(() => i18nStrict.t("msg")).toThrow(/missing.*handler.*link/i);
    });
  });

  describe("Basic HTML Tags Whitelist", () => {
    it("renders whitelisted tags as virtual nodes and allows handler override", () => {
      const i18nWithWhitelist = createI18n({
        locale: "en",
        tagInterpolation: { basicHtmlTags: ["strong"] },
      });
      i18nWithWhitelist.addTranslations({
        en: { msg: "This is <strong>bold</strong>" },
      });

      const result = i18nWithWhitelist.tRaw("msg");

      expect((result as any[])[1]).toMatchObject({ type: "element", tag: "strong" });
      expect(i18nWithWhitelist.t("msg")).toBe("This is bold");

      const overridden = i18nWithWhitelist.tRaw("msg", {
        strong: ({ children }: { children: string }) => `CUSTOM:${children}`,
      });

      expect(overridden).toBe("This is CUSTOM:bold");
    });
  });

  it("returns an array when a handler returns a virtual node", () => {
    i18n.addTranslations({ en: { msg: "Click <link>here</link>" } });

    const vnode = {
      type: "element" as const,
      tag: "a",
      props: { href: "#" },
      children: ["here"],
    };

    const result = i18n.tRaw("msg", {
      link: () => vnode,
    });

    expect((result as any[])[0]).toBe("Click ");
    expect((result as any[])[1]).toBe(vnode);
    expect(i18n.t("msg", { link: () => vnode })).toBe("Click here");
  });
});
