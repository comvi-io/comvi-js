import { afterEach, describe, expect, it } from "vitest";
import { getTextDirection } from "../../src";

// `Intl.Locale#textInfo` exists in every runtime this suite runs on, so the
// hand-rolled script/language tables in `getTextDirection` are only reachable
// once that API is taken away — which is what an older engine looks like. The
// tags below overlap `formatting.test.ts`'s table on purpose: same expectations,
// other code path (that one lets the real `textInfo` answer first).
//
// INVARIANT, needs-seam: `getTextDirection` memoises into a module-level cache
// with no reset export, so every tag in this file must appear in exactly ONE
// test. Reuse a tag across two stubs and the second reads the first's cached
// answer without ever consulting the stub — a silent pass.
//
// Why hand-rolled save/restore rather than `vi.stubGlobal`: `Intl.Locale` is a
// property OF a global, not a `globalThis` key, so `unstubAllGlobals` never
// reaches it.
const RealLocale = Intl.Locale;

function stubTextInfo(textInfo: { direction?: string } | undefined): void {
  (Intl as { Locale: unknown }).Locale = class {
    textInfo = textInfo;
  };
}

afterEach(() => {
  (Intl as { Locale: unknown }).Locale = RealLocale;
});

describe("getTextDirection() on a runtime without Intl.Locale#textInfo", () => {
  it.each([
    ["en", "ltr"],
    ["ar", "rtl"],
    ["he-IL", "rtl"],
    ["ku-Arab", "rtl"],
    ["ar-Arab-EG", "rtl"],
    ["ku-Latn", "ltr"],
    ["ar-Latn", "ltr"],
    ["ks-Deva", "ltr"],
    ["ks-Deva-IN", "ltr"],
    ["fa-u-nu-latn", "rtl"],
    ["es-AR", "ltr"],
    ["not-a-real-locale", "ltr"],
  ])('getTextDirection("%s") → %s', (tag, expected) => {
    stubTextInfo(undefined);

    expect(getTextDirection(tag)).toBe(expected);
  });
});

describe("getTextDirection() memoisation", () => {
  it("asks the runtime once per locale and answers every repeat from the cache", () => {
    let constructions = 0;
    (Intl as { Locale: unknown }).Locale = class {
      textInfo = { direction: "rtl" };
      constructor() {
        constructions++;
      }
    };

    const answers = [getTextDirection("ar-SY"), getTextDirection("ar-SY")];

    expect(answers).toEqual(["rtl", "rtl"]);
    expect(constructions).toBe(1);
  });
});

describe("getTextDirection() with Intl.Locale#textInfo present", () => {
  it("takes an rtl direction from the runtime over the language table", () => {
    stubTextInfo({ direction: "rtl" });

    expect(getTextDirection("de")).toBe("rtl");
  });

  it("takes an ltr direction from the runtime over the language table", () => {
    stubTextInfo({ direction: "ltr" });

    expect(getTextDirection("ar-SA")).toBe("ltr");
  });

  it.each([
    ["ar-EG", "rtl"],
    ["de-CH", "ltr"],
  ])(
    'falls back to the language table for "%s" when the runtime reports an unknown direction',
    (tag, expected) => {
      stubTextInfo({ direction: "auto" });

      expect(getTextDirection(tag)).toBe(expected);
    },
  );
});
