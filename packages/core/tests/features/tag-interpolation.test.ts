import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import { createI18n } from "../helpers/composedHost";

/**
 * The tag-interpolation contract: parsing and nesting, strict mode, the basic
 * HTML whitelist, ICU interactions, and graceful degradation on malformed
 * templates.
 */
describe("t() with tag interpolation", () => {
  it("parses nested tags and applies handlers", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { msg: "Click <a><b>here</b></a>" } });

    const result = i18n.t("msg", {
      a: ({ children }: { children: string }) => `A(${children})`,
      b: ({ children }: { children: string }) => `B(${children})`,
    });

    expect(result).toBe("Click A(B(here))");
  });

  it("parses snake_case tag names", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { msg: "Click <this_link>this link</this_link> for a new one." },
    });

    const result = i18n.t("msg", {
      this_link: ({ children }: { children: string }) => `[${children}]`,
    });

    expect(result).toBe("Click [this link] for a new one.");
  });

  it("parses self-closing snake_case tags inside select branches", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: {
        msg: "{formality, select, formal {Dear<line_break/>Sir} other {Hi<line_break/>there}}",
      },
    });

    const result = i18n.t("msg", {
      formality: "formal",
      line_break: () => " / ",
    });

    expect(result).toBe("Dear / Sir");
  });

  it("flattens snake_case tags to inner text without a handler", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { msg: "Read our <help_article>help article</help_article>" },
    });

    expect(i18n.t("msg", {})).toBe("Read our help article");
  });

  it("supports ICU params inside tags", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { msg: "<bold>Hello {name}</bold>" } });

    const result = i18n.t("msg", {
      name: "Alice",
      bold: ({ children }: { children: string }) => `**${children}**`,
    });

    expect(result).toBe("**Hello Alice**");
  });

  it("handles tags inside plural expressions", () => {
    const i18n = new I18n({ locale: "en" });
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

  it("warns and degrades on mismatched nested tags", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { msg: "Click <a><b>here</a></b>" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = i18n.t("msg");

    expect(result).toBe("Click <a><b>here</a></b>");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Tag mismatch"));
  });

  describe("tagInterpolation.strict", () => {
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

  describe("tagInterpolation.basicHtmlTags", () => {
    const whitelistHost = () => {
      const host = createI18n({
        locale: "en",
        tagInterpolation: { basicHtmlTags: ["strong"] },
      });
      host.addTranslations({ en: { msg: "This is <strong>bold</strong>" } });
      return host;
    };

    it("renders a whitelisted tag as a VirtualNode through tRaw()", () => {
      const result = whitelistHost().tRaw("msg");

      expect(result).toEqual([
        "This is ",
        { type: "element", tag: "strong", props: {}, children: ["bold"] },
      ]);
    });

    it("flattens a whitelisted tag to its inner text through t()", () => {
      expect(whitelistHost().t("msg")).toBe("This is bold");
    });

    it("a param handler overrides the whitelist", () => {
      const overridden = whitelistHost().tRaw("msg", {
        strong: ({ children }: { children: string }) => `CUSTOM:${children}`,
      });

      expect(overridden).toBe("This is CUSTOM:bold");
    });
  });

  it("returns an array when a handler returns a virtual node", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { msg: "Click <link>here</link>" } });
    const vnode = {
      type: "element" as const,
      tag: "a",
      props: { href: "#" },
      children: ["here"],
    };

    const result = i18n.tRaw("msg", { link: () => vnode });

    expect(result).toEqual(["Click ", vnode]);
  });

  it("stringifies a handler-returned virtual node to its inner text through t()", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { msg: "Click <link>here</link>" } });
    const vnode = {
      type: "element" as const,
      tag: "a",
      props: { href: "#" },
      children: ["here"],
    };

    expect(i18n.t("msg", { link: () => vnode })).toBe("Click here");
  });
});
