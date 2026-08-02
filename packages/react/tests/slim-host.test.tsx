/**
 * framework-slim P2 — @comvi/react on a BARE `@comvi/core/slim` host.
 *
 * This is the D′ endpoint: the host implements `WrapperI18nHost` and nothing
 * more. Everything `useI18n()` still returns must work on it, and nothing the
 * wrapper does at render time may touch a loader/plugin member — a single
 * eager `.bind()` of an absent capability would crash every case below.
 *
 * The loud-error side of the contract (exact dev AND prod messages) lives in
 * tests/js-contract/, which runs against the published dist under both build
 * conditions.
 */
import { describe, it, expect } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { createI18n } from "@comvi/core/slim";
import type { WrapperI18nHost } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { useFormatters } from "../src/useFormatters";
import { useSetLocaleTransition } from "../src/useSetLocaleTransition";
import { T } from "../src/T";

const makeHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: {
      en: { greeting: "Hello, {name}!", rich: "Click <link>here</link>", price: "Price" },
      fr: { greeting: "Bonjour, {name} !", rich: "Cliquez <link>ici</link>", price: "Prix" },
    },
  });

const wrapperFor = (i18n: WrapperI18nHost) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </I18nProvider>
    );
  };

describe("react on a bare-slim host", () => {
  it("renders translations through useI18n()", () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useI18n(), { wrapper: wrapperFor(i18n) });

    expect(result.current.t("greeting" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
    expect(result.current.locale).toBe("en");
    expect(result.current.dir).toBe("ltr");
  });

  it("exposes only the host-safe bag — the four capability members are gone", () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useI18n(), { wrapper: wrapperFor(i18n) });

    for (const name of ["t", "tRaw", "setLocale", "addTranslations", "on", "reportError"]) {
      expect(typeof (result.current as unknown as Record<string, unknown>)[name]).toBe("function");
    }
    for (const name of [
      "addActiveNamespace",
      "reloadTranslations",
      "onLoadError",
      "onMissingKey",
    ]) {
      expect(name in result.current).toBe(false);
    }
  });

  it("re-renders on a locale change driven through the host", async () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useI18n(), { wrapper: wrapperFor(i18n) });

    await act(async () => {
      await i18n.setLocaleAsync("fr");
    });

    expect(result.current.locale).toBe("fr");
    expect(result.current.t("greeting" as never, { name: "Ada" } as never)).toBe("Bonjour, Ada !");
  });

  it("formats through useFormatters()", () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useFormatters(), { wrapper: wrapperFor(i18n) });

    expect(result.current.formatNumber(1234.5)).toBe(new Intl.NumberFormat("en").format(1234.5));
    expect(result.current.formatCurrency(10, "USD")).toContain("10");
  });

  it("switches locale through useSetLocaleTransition()", async () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useSetLocaleTransition(), { wrapper: wrapperFor(i18n) });

    await act(async () => {
      result.current.setLocale("fr");
    });

    expect(i18n.locale).toBe("fr");
  });

  it("renders <T> with tag interpolation (per-call extension, no ambient registration)", () => {
    const i18n = makeHost();
    const { container } = render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <T i18nKey={"rich" as never} components={{ link: "a" }} />
      </I18nProvider>,
    );

    expect(container.querySelector("a")).not.toBeNull();
    expect(container.textContent).toBe("Click here");
  });

  it("adds translations at runtime without a loader", () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useI18n(), { wrapper: wrapperFor(i18n) });

    act(() => {
      result.current.addTranslations({ en: { late: "Late binding" } });
    });

    expect(result.current.t("late" as never)).toBe("Late binding");
  });
});

describe("react on slim + attachLoader (composed host)", () => {
  it("keeps useI18n()'s bag identical to the bare-slim one", () => {
    const bare = renderHook(() => useI18n(), { wrapper: wrapperFor(makeHost()) });
    const composed = renderHook(() => useI18n(), { wrapper: wrapperFor(attachLoader(makeHost())) });

    expect(Object.keys(composed.result.current).sort()).toEqual(
      Object.keys(bare.result.current).sort(),
    );
  });
});
