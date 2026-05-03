import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import type { TranslationResult } from "@comvi/core";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

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
    expect(fake.tRaw).toHaveBeenLastCalledWith("title", { ns: "admin" });
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

  it("keeps t() reference stable across locale updates", () => {
    const fake = new FakeI18n();
    const { result } = renderHook(() => useI18n("admin"), { wrapper: createWrapper(fake) });
    const tBefore = result.current.t;

    act(() => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });

    expect(result.current.locale).toBe("fr");
    expect(result.current.t).toBe(tBefore);
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

  it("throws when used outside I18nProvider", () => {
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => renderHook(() => useI18n())).toThrow(
      "[i18n] useI18nContext must be used within an I18nProvider",
    );

    console.error = originalError;
  });
});
