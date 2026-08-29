/**
 * `@comvi/react`'s bindings on the BASE host — a host that implements
 * `WrapperI18nHost` and nothing more. Nothing the wrapper does at render time
 * may touch a loader/plugin member: a single eager `.bind()` of an absent
 * capability would crash every case below.
 *
 * The loud-error half of the contract (exact dev AND prod messages) lives in
 * tests/js-contract/, against the published dist under both build conditions.
 */
import { describe, it, expect } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  attachLoader,
  createI18n,
  I18nProvider,
  T,
  useFormatters,
  useI18n,
  useSetLocaleTransition,
} from "../src/index";
import type { WrapperI18nHost } from "../src/index";

const makeHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: {
      en: { greeting: "Hello, {name}!", rich: "Click <link>here</link>" },
      fr: { greeting: "Bonjour, {name} !", rich: "Cliquez <link>ici</link>" },
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

const HOST_SAFE_MEMBERS = ["t", "tRaw", "setLocale", "addTranslations", "on", "reportError"];
const CAPABILITY_MEMBERS = [
  "addActiveNamespace",
  "reloadTranslations",
  "onLoadError",
  "onMissingKey",
];

describe("react on a base host", () => {
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

    const present = CAPABILITY_MEMBERS.filter((name) => name in result.current);

    expect(present).toEqual([]);
  });

  it("exposes every host-safe member of the bag as a callable", () => {
    const i18n = makeHost();
    const { result } = renderHook(() => useI18n(), { wrapper: wrapperFor(i18n) });

    const bag = result.current as unknown as Record<string, unknown>;
    const missing = HOST_SAFE_MEMBERS.filter((name) => typeof bag[name] !== "function");

    expect(missing).toEqual([]);
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

    expect(result.current.formatNumber(1234.5)).toBe("1,234.5");
    expect(result.current.formatCurrency(10, "USD")).toBe("$10.00");
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

describe("react on base + attachLoader (composed host)", () => {
  it("keeps useI18n()'s bag identical to the base-host one", () => {
    const bare = renderHook(() => useI18n(), { wrapper: wrapperFor(makeHost()) });
    const composed = renderHook(() => useI18n(), { wrapper: wrapperFor(attachLoader(makeHost())) });

    expect(Object.keys(composed.result.current).sort()).toEqual(
      Object.keys(bare.result.current).sort(),
    );
  });
});
