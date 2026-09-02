import { describe, it, expect, vi } from "vitest";
import { render, renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { createI18n, icuCompiler } from "../src/index";
import type { TranslationResult } from "../src/index";
import type { WrapperI18nHost } from "@comvi/core";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { flushMicrotasks } from "./test-utils";

const createWrapper = (fake: FakeI18n) => {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={fake.asI18n()} autoInit={false}>
      {children}
    </I18nProvider>
  );
};

describe("useI18n", () => {
  it("returns reactive state from provider context", () => {
    const fake = new FakeI18n();
    fake.language = "uk";
    fake.isLoading = true;
    fake.isInitializing = true;

    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    expect(result.current.locale).toBe("uk");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isInitializing).toBe(true);
  });

  it("creates namespace-bound t() when default namespace is provided", () => {
    const fake = new FakeI18n();
    fake.tImplementation = (key, params) => `${key}|${params?.ns ?? "none"}`;

    const { result } = renderHook(() => useI18n("admin"), { wrapper: createWrapper(fake) });

    expect(result.current.t("title" as never)).toBe("title|admin");
    // `tRaw` injects the React-tracked locale into every call, so lookups
    // resolve against the render-time locale, not the mutable instance one.
    expect(fake.tRaw).toHaveBeenLastCalledWith("title", { ns: "admin", locale: "en" });
  });

  it("returns plain text from t() and keeps structured output in tRaw()", () => {
    const fake = new FakeI18n();
    const raw: TranslationResult = [
      "Hello ",
      { type: "text", text: "world" },
      { type: "element", tag: "strong", props: {}, children: ["!"] },
    ];
    fake.tImplementation = () => raw;

    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    expect(result.current.t("title" as never)).toBe("Hello world!");
    expect(result.current.tRaw("title" as never)).toEqual(raw);
  });

  it("flattens React element params to plain text in t()", () => {
    const fake = new FakeI18n();
    const raw = ["Hello ", <strong key="name">Alice</strong>] as unknown as TranslationResult;
    fake.tImplementation = () => raw;

    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    expect(result.current.t("title" as never)).toBe("Hello Alice");
    expect(result.current.tRaw("title" as never)).toEqual(raw);
  });

  it("rebuilds t() reference on locale change so callers re-translate with new locale", async () => {
    // The identity churn is intended: a rebuilt closure captures the new
    // locale, which is what prevents tearing during a transition-wrapped flip.
    // The act-wrapped flush drains `useSubscribe`'s microtask.
    const fake = new FakeI18n();
    const { result } = renderHook(() => useI18n("admin"), { wrapper: createWrapper(fake) });
    const tBefore = result.current.t;
    const tRawBefore = result.current.tRaw;

    await act(async () => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
      await flushMicrotasks();
    });

    expect(result.current.locale).toBe("fr");
    expect(result.current.t).not.toBe(tBefore);
    expect(result.current.tRaw).not.toBe(tRawBefore);
  });

  it("binds formatters to the React-tracked render locale", async () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });
    const formatNumberFromEnglishRender = result.current.formatNumber;
    const setLocaleBefore = result.current.setLocale;

    fake.language = "de";

    expect(formatNumberFromEnglishRender(1234)).toBe("1,234");

    await act(async () => {
      fake.emit("localeChanged", { from: "en", to: "de" });
      await flushMicrotasks();
    });

    expect(result.current.locale).toBe("de");
    expect(result.current.formatNumber(1234)).toBe("1.234");
    expect(result.current.setLocale).toBe(setLocaleBefore);
  });

  it("re-renders when fallback config changes without a cache revision change", async () => {
    const i18n = createI18n({
      locale: "fr",
      defaultNs: "common",
      translation: {
        en: { fallbackOnly: "Fallback" },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </I18nProvider>
    );
    const { result } = renderHook(() => useI18n(), { wrapper });
    const revisionBefore = i18n.translationCache.getRevision();

    expect(result.current.t("fallbackOnly" as never)).toBe("fallbackOnly");

    act(() => {
      i18n.setFallbackLocale("en");
    });

    expect(i18n.translationCache.getRevision()).toBe(revisionBefore);
    await waitFor(() => {
      expect(result.current.t("fallbackOnly" as never)).toBe("Fallback");
    });
  });

  it("exposes defaultParams and re-renders after setDefaultParams", async () => {
    const i18n = createI18n({
      locale: "en",
      // `{…, select, …}` is ICU: the base host does not compile it unless the
      // app asks, and this one asks in the same call.
      compiler: icuCompiler,
      defaultParams: { formality: "formal" as const },
      translation: {
        en: { review: "{formality, select, formal {Formal} other {Informal}}" },
      },
    });
    // `I18nProvider`'s `i18n` prop is `WrapperI18nHost<{}>`, not
    // `WrapperI18nHost<D>`, and `setDefaultParams` makes the host invariant in
    // `D`, so no `createI18n({ defaultParams })` instance is assignable to it.
    // The cast stands in until the prop is generic over the defaults type.
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n as unknown as WrapperI18nHost} autoInit={false}>
        {children}
      </I18nProvider>
    );
    const { result } = renderHook(() => useI18n<{ formality: "formal" | "informal" }>(), {
      wrapper,
    });

    expect(result.current.defaultParams?.formality).toBe("formal");
    expect(result.current.t("review" as never)).toBe("Formal");

    act(() => result.current.setDefaultParams({ formality: "informal" }));

    await waitFor(() => {
      expect(result.current.defaultParams?.formality).toBe("informal");
      expect(result.current.t("review" as never)).toBe("Informal");
    });
  });

  it("proxies setLocale() to i18n.setLocaleAsync()", async () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    await act(async () => {
      await result.current.setLocale("fr");
    });

    expect(fake.setLocaleAsync).toHaveBeenCalledWith("fr");
  });

  it("proxies addTranslations() and updates translation cache reference data", () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    const revisionBefore = fake.translationCache.getRevision();

    act(() => {
      result.current.addTranslations({ en: { hello: "Hello" } });
    });

    expect(fake.addTranslations).toHaveBeenCalledWith({ en: { hello: "Hello" } });
    expect(fake.translationCache.getRevision()).toBe(revisionBefore + 1);
    expect(result.current.translationCache.has("en:default")).toBe(true);
  });

  it("exposes on() with unsubscribe behavior", () => {
    const fake = new FakeI18n();
    const spy = vi.fn();
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    const unsubscribe = result.current.on("localeChanged", spy);

    act(() => {
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });
    expect(spy).toHaveBeenCalledWith({ from: "en", to: "fr" });

    unsubscribe();

    act(() => {
      fake.emit("localeChanged", { from: "fr", to: "de" });
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("proxies reportError() to i18n.reportError()", () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });
    const error = new Error("boom");
    const context = { source: "translation", tagName: "link" } as const;

    result.current.reportError(error, context);

    expect(fake.reportError).toHaveBeenCalledWith(error, context);
  });

  it("keeps bound method references stable across provider updates", () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });
    const setLocaleBefore = result.current.setLocale;
    const onBefore = result.current.on;

    act(() => {
      fake.emit("initialized", undefined);
    });

    expect(result.current.setLocale).toBe(setLocaleBefore);
    expect(result.current.on).toBe(onBefore);
  });

  it("formats dates with the render locale in the requested time zone", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    const formatted = result.current.formatDate(Date.UTC(2024, 0, 15), {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    expect(formatted).toBe("01/15/2024");
  });

  it("formats currency with the render locale", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    expect(result.current.formatCurrency(1234.5, "EUR")).toBe("€1,234.50");
  });

  it("formats relative time with the render locale", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    expect(result.current.formatRelativeTime(-2, "hour")).toBe("2 hours ago");
  });

  it("reports rtl direction for a right-to-left render locale", () => {
    const fake = new FakeI18n({ language: "ar" });

    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    expect(result.current.dir).toBe("rtl");
  });

  it("rebinds host methods to the new instance when the i18n prop changes", async () => {
    const first = new FakeI18n();
    const second = new FakeI18n();
    let setLocale: ((locale: string) => Promise<void>) | undefined;

    const Probe = () => {
      setLocale = useI18n().setLocale;
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
      await setLocale!("fr");
    });

    expect(second.setLocaleAsync).toHaveBeenCalledWith("fr");
    expect(first.setLocaleAsync).not.toHaveBeenCalled();
  });

  it("throws when used outside I18nProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useI18n())).toThrow(
      "[i18n] Hooks must be used within an I18nProvider",
    );
  });
});
