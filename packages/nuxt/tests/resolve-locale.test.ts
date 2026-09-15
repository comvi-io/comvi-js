import { describe, it, expect } from "vitest";
import { resolveAcceptLanguage } from "../src/runtime/utils/resolve-locale";

describe("resolveAcceptLanguage", () => {
  const locales = ["en", "de", "uk", "fr"] as const;

  it("returns exact match for simple header", () => {
    expect(resolveAcceptLanguage("de", locales)).toBe("de");
  });

  it("picks the highest quality language", () => {
    expect(resolveAcceptLanguage("uk;q=0.7,de;q=0.9,en;q=0.5", locales)).toBe("de");
  });

  it("matches base language from regional code (en-US -> en)", () => {
    expect(resolveAcceptLanguage("en-US,fr;q=0.5", locales)).toBe("en");
  });

  it("matches regional locale from base (en -> en-US)", () => {
    const regionalLocales = ["en-US", "de-DE", "fr-FR"];
    expect(resolveAcceptLanguage("en", regionalLocales)).toBe("en-US");
  });

  it("is case-insensitive", () => {
    expect(resolveAcceptLanguage("DE-de", locales)).toBe("de");
  });

  it("returns undefined when no locale matches", () => {
    expect(resolveAcceptLanguage("ja,zh;q=0.9", locales)).toBeUndefined();
  });

  it("returns undefined for empty header", () => {
    expect(resolveAcceptLanguage("", locales)).toBeUndefined();
  });

  it("handles malformed quality values gracefully", () => {
    // NaN quality defaults to 1
    expect(resolveAcceptLanguage("de;q=abc,en;q=0.5", locales)).toBe("de");
  });

  it("handles missing quality value after q=", () => {
    expect(resolveAcceptLanguage("fr;q=,de;q=0.8", locales)).toBe("fr");
  });

  it("handles complex real-world Accept-Language headers", () => {
    expect(resolveAcceptLanguage("en-GB,en-US;q=0.9,en;q=0.8,uk;q=0.7,de;q=0.5", locales)).toBe(
      "en",
    );
  });

  it("prefers exact match over base language match", () => {
    const withRegional = ["en-US", "en", "de"];
    expect(resolveAcceptLanguage("en-US;q=0.9,en;q=0.8", withRegional)).toBe("en-US");
  });

  it("trims whitespace that survives the quality-value split", () => {
    expect(resolveAcceptLanguage("de ;q=0.9", locales)).toBe("de");
  });

  it("keeps trying lower-quality languages after one fails every match strategy", () => {
    expect(resolveAcceptLanguage("ja,de;q=0.5", locales)).toBe("de");
  });

  /**
   * Parity with `@comvi/next` (packages/next/tests/middleware.test.ts, "ignores
   * a language explicitly refused with q=0"). RFC 9110: `q=0` means "not
   * acceptable", so the entry is dropped before matching rather than merely
   * sorted last.
   */
  it("ignores a language explicitly refused with q=0", () => {
    expect(resolveAcceptLanguage("fr;q=0", ["en", "fr"])).toBeUndefined();
    expect(resolveAcceptLanguage("fr;q=0,en;q=0.8", ["en", "fr"])).toBe("en");
  });

  it("ignores a refused language whose region or base would otherwise match", () => {
    expect(resolveAcceptLanguage("fr-CA;q=0,de;q=0.5", locales)).toBe("de");
    expect(resolveAcceptLanguage("fr;q=0.000", locales)).toBeUndefined();
  });

  it("keeps a language whose quality is merely low", () => {
    expect(resolveAcceptLanguage("fr;q=0.001", locales)).toBe("fr");
  });

  it("skips an entry with no language tag", () => {
    expect(resolveAcceptLanguage(",de;q=0.5", locales)).toBe("de");
  });
});
