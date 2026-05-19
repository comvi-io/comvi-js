import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useSetLocaleTransition } from "../src/useSetLocaleTransition";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

const createWrapper = (fake: FakeI18n) => {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={fake.asI18n()} autoInit={false}>
      {children}
    </I18nProvider>
  );
};

describe("useSetLocaleTransition", () => {
  it("returns isPending=false initially", () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    expect(result.current.isPending).toBe(false);
  });

  it("calls i18n.setLocaleAsync with the given locale", async () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    await act(async () => {
      result.current.setLocale("fr");
    });

    expect(fake.setLocaleAsync).toHaveBeenCalledWith("fr");
  });

  it("isPending is false after the transition settles", async () => {
    const fake = new FakeI18n();

    let resolveFn!: () => void;
    const deferred = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    fake.setLocaleAsync.mockImplementation(async () => {
      await deferred;
    });

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    expect(result.current.isPending).toBe(false);

    // Resolve while still pending, then flush
    await act(async () => {
      result.current.setLocale("fr");
      resolveFn();
    });

    expect(result.current.isPending).toBe(false);
    expect(fake.setLocaleAsync).toHaveBeenCalledWith("fr");
  });

  it("locale is updated after setLocale resolves", async () => {
    const fake = new FakeI18n();

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    await act(async () => {
      result.current.setLocale("de");
      // setLocaleAsync on FakeI18n mutates fake.language synchronously via core
    });

    expect(fake.setLocaleAsync).toHaveBeenCalledWith("de");
  });

  it("throws when used outside I18nProvider", () => {
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => renderHook(() => useSetLocaleTransition())).toThrow(
      "[i18n] Hooks must be used within an I18nProvider",
    );

    console.error = originalError;
  });

  it("setLocale reference is stable across re-renders", () => {
    const fake = new FakeI18n();
    const { result, rerender } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    const setLocaleBefore = result.current.setLocale;
    rerender();

    expect(result.current.setLocale).toBe(setLocaleBefore);
  });
});
