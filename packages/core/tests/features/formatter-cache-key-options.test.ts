import { describe, it, expect } from "vitest";
import type { LocaleSource } from "../../src";
import { formatDate, formatRelativeTime } from "../../src/format";

// The Intl formatter caches are keyed by [locale, options]; `tests/setup.ts` empties them
// after every test, so the options-less call below is the only entry each case starts from.
const source: LocaleSource = { locale: "en" };
const DATE = new Date(Date.UTC(2026, 4, 19));

describe("formatDate()", () => {
  it("does not serve an options-bearing call from the options-less cache entry", () => {
    formatDate(source, DATE);

    const monthOnly = formatDate(source, DATE, { month: "long", timeZone: "UTC" });

    expect(monthOnly).toBe("May");
  });
});

describe("formatRelativeTime()", () => {
  it("does not serve an options-bearing call from the options-less cache entry", () => {
    formatRelativeTime(source, -1, "day");

    const auto = formatRelativeTime(source, -1, "day", { numeric: "auto" });

    expect(auto).toBe("yesterday");
  });
});
