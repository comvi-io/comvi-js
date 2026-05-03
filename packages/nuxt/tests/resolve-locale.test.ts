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
});
