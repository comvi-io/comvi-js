import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useFormatters } from "../src/useFormatters";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

const createWrapper = (fake: FakeI18n) => {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={fake.asI18n()} autoInit={false}>
      {children}
    </I18nProvider>
  );
};

const mountFormatters = (language = "en") => {
  const fake = new FakeI18n({ language });
  const { result, rerender } = renderHook(() => useFormatters(), {
    wrapper: createWrapper(fake),
  });
  return { fake, result, rerender };
};

describe("useFormatters", () => {
  it("formatNumber uses en-US grouping for locale=en", () => {
    const { result } = mountFormatters();

    expect(result.current.formatNumber(1234)).toBe("1,234");
  });

  it("formatNumber renders zero and negative values under the same grouping rules", () => {
    const { result } = mountFormatters();

    expect(result.current.formatNumber(0)).toBe("0");
    expect(result.current.formatNumber(-1234.5)).toBe("-1,234.5");
  });

  it("formatNumber updates to de grouping after locale flip", async () => {
    const { fake, result } = mountFormatters();

    expect(result.current.formatNumber(1234)).toBe("1,234");

    await act(async () => {
      await fake.setLocaleAsync("de");
    });

    expect(result.current.formatNumber(1234)).toBe("1.234");
  });

  it("returns same formatters object across re-renders when locale unchanged", () => {
    const { result, rerender } = mountFormatters();

    const firstRef = result.current;
    rerender();
    expect(result.current).toBe(firstRef);
  });

  it("formatters object identity changes after locale flip", async () => {
    const { fake, result } = mountFormatters();

    const before = result.current;

    await act(async () => {
      await fake.setLocaleAsync("de");
    });

    expect(result.current).not.toBe(before);
  });

  it("formatDate smoke test — returns a non-empty string", () => {
    const { result } = mountFormatters();

    // `timeZone` is passed explicitly so the assertion does not move with the
    // machine's zone; `formatDate` forwards `Intl.DateTimeFormatOptions`.
    const formatted = result.current.formatDate(new Date("2024-06-15T12:00:00Z"), {
      timeZone: "UTC",
      dateStyle: "medium",
    });

    expect(formatted).toBe("Jun 15, 2024");
  });

  it("formatCurrency smoke test — formats USD correctly for en locale", () => {
    const { result } = mountFormatters();

    expect(result.current.formatCurrency(9.99, "USD")).toBe("$9.99");
  });

  it("formatRelativeTime smoke test — returns a non-empty string", () => {
    const { result } = mountFormatters();

    expect(result.current.formatRelativeTime(-2, "day")).toBe("2 days ago");
  });

  it("throws when used outside I18nProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useFormatters())).toThrow(
      "[i18n] Hooks must be used within an I18nProvider",
    );
  });
});
