import { describe, it, expect, beforeEach, vi } from "vitest";
import { createI18n } from "../helpers/composedHost";
import { makeMarkerExtension } from "../helpers/extensions";

/**
 * What `processTag` does once a tag token exists: the self-closing branch of
 * the basic-HTML whitelist, and every route the `strict: "warn"` fallback can
 * take to report a missing handler.
 */

const MISSING_LINK_WARNING = "[i18n] Missing handler for tag: <link>. Falling back to inner text.";

const RICH = { en: { msg: "Click <link>here</link>" } };

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("basic-HTML whitelist", () => {
  it("renders a self-closing whitelisted tag as an element with NO children", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "a<br/>b" } },
      tagInterpolation: { basicHtmlTags: ["br"] },
    });

    expect(i18n.tRaw("msg")).toEqual([
      "a",
      { type: "element", tag: "br", props: {}, children: [] },
      "b",
    ]);
  });
});

describe("missing tag handler", () => {
  it("stays silent by default and falls back to the inner text", () => {
    const i18n = createI18n({ locale: "en", translation: RICH });

    const result = i18n.t("msg");

    expect(result).toBe("Click here");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns on the console when strict is 'warn' and no reporter is configured", () => {
    const i18n = createI18n({ locale: "en", translation: RICH });

    const result = i18n.t("msg", { tagInterpolation: { strict: "warn" } });

    expect(result).toBe("Click here");
    expect(warnSpy).toHaveBeenCalledWith(MISSING_LINK_WARNING);
  });

  it("hands the tag name to onTagWarning instead of the console", () => {
    const onTagWarning = vi.fn();
    const i18n = createI18n({ locale: "en", translation: RICH });

    const result = i18n.t("msg", { tagInterpolation: { strict: "warn", onTagWarning } });

    expect(result).toBe("Click here");
    expect(onTagWarning).toHaveBeenCalledWith("link");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("reports through onError when the instance configured tags without a reporter", () => {
    const onError = vi.fn();
    const i18n = createI18n({
      locale: "en",
      translation: RICH,
      tagInterpolation: { strict: "warn" },
      onError,
    });

    const result = i18n.t("msg");

    expect(result).toBe("Click here");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Missing handler for tag: <link>" }),
      { source: "translation", tagName: "link" },
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to the console warning when onTagWarning itself throws", () => {
    const i18n = createI18n({ locale: "en", translation: RICH });

    const result = i18n.t("msg", {
      tagInterpolation: {
        strict: "warn",
        onTagWarning: () => {
          throw new Error("reporter exploded");
        },
      },
    });

    expect(result).toBe("Click here");
    expect(warnSpy).toHaveBeenCalledWith(MISSING_LINK_WARNING);
  });
});

describe("extension dispatch at render time", () => {
  it("the tag extension declines a token it did not produce, so the next one renders it", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "a&mark;b" } },
      tagInterpolation: { extensions: [makeMarkerExtension()] },
    });

    const rendered = i18n.t("msg");

    expect(rendered).toBe("a!b");
  });
});
