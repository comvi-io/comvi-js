import { describe, expect, it, vi } from "vitest";
import { flattenCatalog } from "../../src";

describe("flattenCatalog() with non-string leaves", () => {
  it.each([
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
  ])("drops a %s leaf and names the dropped key", (_label, value, printed) => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const flat = flattenCatalog({ nav: { home: "Home", away: value } });

    expect(Object.keys(flat)).toStrictEqual(["nav.home"]);
    expect(warnSpy).toHaveBeenCalledWith(
      `[i18n] Dropping translation "nav.away": value is ${printed}`,
    );
  });

  it("coerces a number leaf and names its type in the warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const flat = flattenCatalog({ count: 3 });

    expect(flat).toEqual({ count: "3" });
    expect(warnSpy).toHaveBeenCalledWith(
      '[i18n] Translation "count" is not a string (got number); coercing with String()',
    );
  });

  it("coerces an array leaf and reports it as an array, not an object", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const flat = flattenCatalog({ tags: ["a", "b"] });

    expect(flat).toEqual({ tags: "a,b" });
    expect(warnSpy).toHaveBeenCalledWith(
      '[i18n] Translation "tags" is not a string (got array); coercing with String()',
    );
  });
});
