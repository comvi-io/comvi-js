import { describe, it, expect } from "vitest";
import { ACCEPT_LANGUAGE_CASES } from "@comvi/test-utils/acceptLanguageTable";
import { resolveAcceptLanguage } from "../src/index";

/**
 * The shared table against the shared function. `packages/next` and
 * `packages/nuxt` assert the SAME table through their own public resolvers, so
 * the three suites cannot disagree about a row without one of them going red.
 */
describe("resolveAcceptLanguage — the shared contract table", () => {
  for (const { header, locales, expected, why } of ACCEPT_LANGUAGE_CASES) {
    it(`${JSON.stringify(header)} over ${JSON.stringify(locales)} → ${String(expected)} — ${why}`, () => {
      expect(resolveAcceptLanguage(header, locales)).toBe(expected);
    });
  }
});

describe("resolveAcceptLanguage — properties the table implies", () => {
  it("returns a member of the configured list, never a header tag", () => {
    for (const { header, locales } of ACCEPT_LANGUAGE_CASES) {
      const answer = resolveAcceptLanguage(header, locales);
      if (answer !== undefined) {
        expect(locales).toContain(answer);
      }
    }
  });

  it("never mutates the locales array it is given", () => {
    const locales = ["en", "de", "fr"];
    const before = [...locales];
    resolveAcceptLanguage("de;q=0.2,fr;q=0.9,en;q=0", locales);
    expect(locales).toEqual(before);
  });

  it("accepts a readonly tuple, which is how both bindings hold their config", () => {
    const locales = ["en", "de"] as const;
    expect(resolveAcceptLanguage("de", locales)).toBe("de");
  });

  it("resolves against an empty locale list without throwing", () => {
    expect(resolveAcceptLanguage("en,de;q=0.5", [])).toBeUndefined();
  });
});
