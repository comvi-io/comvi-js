import { describe, it, expect } from "vitest";
// Composed-host tag parity gate: this file imports ONLY the composed-host test
// helper — zero "/tags" imports anywhere in its module graph. That helper
// mirrors the 0.4 root, which registered tag syntax itself, so string-API tag
// interpolation must behave exactly as 0.4.0 (where parseTag was
// unconditionally active). The converged `@comvi/core` root registers nothing;
// the names below are kept for the historical root this gate stands in for.
import { createI18n, I18n } from "../helpers/composedHost";
import type { ElementNode } from "../helpers/composedHost";

describe("root entry tag parity (0.4.0 behavior, no /tags import)", () => {
  it("t() renders tag handlers from params", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link>here</link> now" } },
    });
    expect(i18n.t("msg", { link: ({ children }: { children: unknown }) => `[${children}]` })).toBe(
      "Click [here] now",
    );
  });

  it("tRaw() renders whitelisted basic HTML tags as VirtualNodes", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "<strong>bold</strong> text" } },
      tagInterpolation: { basicHtmlTags: ["strong"] },
    });
    const result = i18n.tRaw("msg");
    expect(Array.isArray(result)).toBe(true);
    const [node, rest] = result as [ElementNode, string];
    expect(node.type).toBe("element");
    expect(node.tag).toBe("strong");
    expect(node.children).toEqual(["bold"]);
    expect(rest).toBe(" text");
  });

  it("tags compose with ICU plurals through the root entry", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: { msg: "{count, plural, one {<b>#</b> file} other {<b>#</b> files}}" },
      },
    });
    expect(
      i18n.t("msg", { count: 2, b: ({ children }: { children: unknown }) => `*${children}*` }),
    ).toBe("*2* files");
  });

  it("new I18n() from the root keeps the single-argument constructor and ICU behavior", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { n: "{count, plural, one {# item} other {# items}}" } });
    expect(i18n.t("n", { count: 1 })).toBe("1 item");
  });

  it("unknown tags without handler fall back to inner text (non-strict default)", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "see <thing>inside</thing>" } },
    });
    expect(i18n.t("msg")).toBe("see inside");
  });
});
