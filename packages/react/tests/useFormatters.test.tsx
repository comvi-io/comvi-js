import { describe, it, expect } from "vitest";
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

describe("useFormatters", () => {
  it("formatNumber uses en-US grouping for locale=en", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useFormatters(), { wrapper: createWrapper(fake) });

    const formatted = result.current.formatNumber(1234);
    // en locale produces "1,234"
    expect(formatted).toBe("1,234");
  });

  it("formatNumber updates to de grouping after locale flip", async () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useFormatters(), { wrapper: createWrapper(fake) });

    expect(result.current.formatNumber(1234)).toBe("1,234");

    await act(async () => {
      await fake.setLocaleAsync("de");
    });

    // de locale produces "1.234"
    expect(result.current.formatNumber(1234)).toBe("1.234");
  });

  it("returns same formatters object across re-renders when locale unchanged", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result, rerender } = renderHook(() => useFormatters(), {
      wrapper: createWrapper(fake),
    });

    const firstRef = result.current;
    rerender();
    expect(result.current).toBe(firstRef);
  });

  it("formatters object identity changes after locale flip", async () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useFormatters(), { wrapper: createWrapper(fake) });

    const before = result.current;

    await act(async () => {
      await fake.setLocaleAsync("de");
    });

    expect(result.current).not.toBe(before);
  });

  it("formatDate smoke test — returns a non-empty string", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useFormatters(), { wrapper: createWrapper(fake) });

    const date = new Date("2024-06-15T12:00:00Z");
    const formatted = result.current.formatDate(date);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("formatCurrency smoke test — formats USD correctly for en locale", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useFormatters(), { wrapper: createWrapper(fake) });

    const formatted = result.current.formatCurrency(9.99, "USD");
    expect(formatted).toContain("9.99");
    expect(formatted).toMatch(/\$/);
  });

  it("formatRelativeTime smoke test — returns a non-empty string", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useFormatters(), { wrapper: createWrapper(fake) });

    const formatted = result.current.formatRelativeTime(-2, "day");
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("throws when used outside I18nProvider", () => {
    const originalError = console.error;
    console.error = () => {};

    try {
      expect(() => renderHook(() => useFormatters())).toThrow(
        "[i18n] Hooks must be used within an I18nProvider",
      );
    } finally {
      console.error = originalError;
    }
  });
});
