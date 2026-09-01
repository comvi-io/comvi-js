import { describe, it, expect, vi } from "vitest";
import { render, renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useSetLocaleTransition } from "../src/useSetLocaleTransition";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { createDeferred } from "./test-utils";

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

  it("keeps isPending true until the async locale change settles", async () => {
    const fake = new FakeI18n();

    const deferred = createDeferred<void>();

    fake.setLocaleAsync.mockImplementation(() => deferred.promise);

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    expect(result.current.isPending).toBe(false);

    await act(async () => {
      result.current.setLocale("fr");
    });

    expect(result.current.isPending).toBe(true);

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(fake.setLocaleAsync).toHaveBeenCalledWith("fr");
  });

  it("locale is updated after setLocale resolves", async () => {
    const fake = new FakeI18n();

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    await act(async () => {
      result.current.setLocale("de");
    });

    expect(fake.setLocaleAsync).toHaveBeenCalledWith("de");
    expect(fake.language).toBe("de");
  });

  it("throws when used outside I18nProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useSetLocaleTransition())).toThrow(
      "[i18n] Hooks must be used within an I18nProvider",
    );
  });

  it("clears isPending and reports the error when the locale change rejects", async () => {
    const fake = new FakeI18n();
    const deferred = createDeferred<void>();
    fake.setLocaleAsync.mockImplementation(() => deferred.promise);

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    await act(async () => {
      result.current.setLocale("fr");
    });

    expect(result.current.isPending).toBe(true);

    await act(async () => {
      deferred.reject(new Error("catalog 500"));
      await deferred.promise.catch(() => {});
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(fake.reportError).toHaveBeenCalledWith(new Error("catalog 500"), {
      source: "setLocale",
      locale: "fr",
    });
  });

  it("normalizes a non-Error locale-change rejection before reporting it", async () => {
    const fake = new FakeI18n();
    const deferred = createDeferred<void>();
    fake.setLocaleAsync.mockImplementation(() => deferred.promise);

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    await act(async () => {
      result.current.setLocale("fr");
    });
    await act(async () => {
      deferred.reject("catalog exploded");
      await deferred.promise.catch(() => {});
    });

    await waitFor(() => {
      expect(fake.reportError).toHaveBeenCalledWith(new Error("catalog exploded"), {
        source: "setLocale",
        locale: "fr",
      });
    });
  });

  // A sequence scenario on purpose: the pending COUNT, not a boolean, is what
  // keeps overlapping locale changes from clearing each other's pending state.
  it("keeps isPending true until every overlapping locale change settles", async () => {
    const fake = new FakeI18n();
    const firstChange = createDeferred<void>();
    const secondChange = createDeferred<void>();
    const inFlight = [firstChange.promise, secondChange.promise];
    fake.setLocaleAsync.mockImplementation(() => inFlight.shift()!);

    const { result } = renderHook(() => useSetLocaleTransition(), {
      wrapper: createWrapper(fake),
    });

    await act(async () => {
      result.current.setLocale("fr");
    });
    await act(async () => {
      result.current.setLocale("de");
    });

    await act(async () => {
      firstChange.resolve();
      await firstChange.promise;
    });

    expect(result.current.isPending).toBe(true);

    await act(async () => {
      secondChange.resolve();
      await secondChange.promise;
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it("rebinds setLocale to the new instance when the i18n prop changes", async () => {
    const first = new FakeI18n();
    const second = new FakeI18n();
    let setLocale: ((locale: string) => void) | undefined;

    const Probe = () => {
      setLocale = useSetLocaleTransition().setLocale;
      return null;
    };
    const Host = ({ fake }: { fake: FakeI18n }) => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    );

    const { rerender } = render(<Host fake={first} />);
    rerender(<Host fake={second} />);

    await act(async () => {
      setLocale!("fr");
    });

    expect(second.setLocaleAsync).toHaveBeenCalledWith("fr");
    expect(first.setLocaleAsync).not.toHaveBeenCalled();
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
