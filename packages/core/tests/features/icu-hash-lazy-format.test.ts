import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../helpers/composedInstance";
import type { TranslationParams } from "../../src/types";

/**
 * `#` is the count formatted for the locale, and formatting is only worth
 * doing when a `#` is there to receive it. A count of 1,234 is outside the
 * plain-integer shortcut, so each formatted `#` scope is one read of
 * `Intl.NumberFormat.prototype.format` — an accessor, which is why the spy
 * sits on its getter.
 */

function render(template: string, params: TranslationParams): string {
  const i18n = createI18n({ locale: "en", messages: { en: { msg: template } } });
  return i18n.t("msg", params);
}

/** Builds the per-locale formatter up front, so its one-off probe is not counted. */
function formatReads() {
  render("{n, plural, other {#}}", { n: 1 });
  // TypeScript's lib declares `format` as a method; at runtime it is a getter.
  return vi.spyOn(Intl.NumberFormat.prototype as unknown as { format: unknown }, "format", "get");
}

describe("formatting the count of a plural", () => {
  it("a text-only branch with no # → the count is not formatted", () => {
    const reads = formatReads();

    const rendered = render("{n, plural, one {one item} other {many items}}", { n: 1234 });

    expect(rendered).toBe("many items");
    expect(reads).toHaveBeenCalledTimes(0);
  });

  it("a text-only branch with # → formatted once", () => {
    const reads = formatReads();

    const rendered = render("{n, plural, one {# item} other {# of # items}}", { n: 1234 });

    expect(rendered).toBe("1,234 of 1,234 items");
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it("a branch with a parameter and no # → the count is not formatted", () => {
    const reads = formatReads();

    const rendered = render("{n, plural, other {{name} has many}}", { n: 1234, name: "Ada" });

    expect(rendered).toBe("Ada has many");
    expect(reads).toHaveBeenCalledTimes(0);
  });

  it("a branch with a parameter and # → formatted once", () => {
    const reads = formatReads();

    const rendered = render("{n, plural, other {{name} has #}}", { n: 1234, name: "Ada" });

    expect(rendered).toBe("Ada has 1,234");
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it("a selectordinal branch with no # → the count is not formatted", () => {
    const reads = formatReads();

    const rendered = render("{n, selectordinal, other {later}}", { n: 1234 });

    expect(rendered).toBe("later");
    expect(reads).toHaveBeenCalledTimes(0);
  });

  it("an outer # after an inner plural with no # → still the outer count", () => {
    const rendered = render("{a, plural, other {{b, plural, other {{name}}} of #}}", {
      a: 1234,
      b: 5678,
      name: "Ada",
    });

    expect(rendered).toBe("Ada of 1,234");
  });

  it("an inner # under an outer branch with a # of its own → each its own count", () => {
    const rendered = render("{a, plural, other {# / {b, plural, other {#}} / #}}", {
      a: 1234,
      b: 5678,
    });

    expect(rendered).toBe("1,234 / 5,678 / 1,234");
  });
});

describe("a count that is not a number, in a plural with #", () => {
  it.each([
    { given: "NaN", count: NaN },
    { given: "a non-numeric string", count: "many" },
  ])("$given → the argument verbatim, with no # resolved", ({ count }) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const rendered = render("{count, plural, one {# apple} other {# apples}}", { count });

    expect(rendered).toBe("{count, plural, one {# apple} other {# apples}}");
  });
});
