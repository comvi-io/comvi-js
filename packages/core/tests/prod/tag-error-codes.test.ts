/**
 * Tag interpolation in a PRODUCTION build, in its own file: importing
 * `register-tags` claims the `<` grammar AMBIENTLY for the whole module
 * registry, and vitest gives every FILE a fresh one — isolating it is what
 * keeps the sibling prod suites independent of test order.
 */
import { describe, it, expect } from "vitest";
import "../../src/register-tags";
import { createI18n } from "../../src";

const RICH = { en: { msg: "Click <link>here</link>" } };

describe("strict tag interpolation", () => {
  it("throws the bare E_MISSING_TAG_HANDLER code when no handler claims the tag", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: RICH,
      tagInterpolation: { strict: true },
    });

    expect(() => i18n.t("msg")).toThrowError(
      expect.objectContaining({ message: "E_MISSING_TAG_HANDLER" }),
    );
  });

  it("renders the inner text when a handler is present, so the throw is about absence only", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: RICH,
      tagInterpolation: { strict: true },
    });

    expect(i18n.t("msg", { link: ({ children }) => `[${children}]` })).toBe("Click [here]");
  });
});

describe("an ICU argument with the tag grammar loaded", () => {
  it("keeps the whole braced group literal — the tags inside it are never parsed", () => {
    const template = "{count, plural, one {<b>#</b> tagged} other {<b>#</b> taggeds}}";
    const reports: Array<{ argumentType?: unknown }> = [];
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { tagged: template } },
      onError: (error) => void reports.push(error),
    });

    expect(i18n.t("tagged", { count: 2 })).toBe(template);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.argumentType).toBe("plural");
  });

  it("leaves no hit behind for the next translation when the render throws", () => {
    const reports: Error[] = [];
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: {
        en: {
          mixed: "{n, plural, one {# left} other {# lefts}} <link>here</link>",
          plain: "Just text",
        },
      },
      tagInterpolation: { strict: true },
      onError: (error) => void reports.push(error),
    });

    // The ICU segment records its hit while the template is PARSED; the strict
    // tag then throws while it is RENDERED, so the host never reaches the
    // read-and-clear that would have reported it.
    expect(() => i18n.t("mixed", { n: 2 })).toThrowError(
      expect.objectContaining({ message: "E_MISSING_TAG_HANDLER" }),
    );

    expect(i18n.t("plain")).toBe("Just text");
    expect(reports).toEqual([]);
  });

  it("still parses tags outside an ICU argument, so the claim above is not vacuous", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { m: "a <b>b</b> c" } },
    });

    expect(i18n.t("m", { b: ({ children }) => `B${children}` })).toBe("a Bb c");
  });
});
