import { describe, it, expect } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { I18nProvider, createI18n, useFormatters, useI18n } from "../src/index";

// `zz` is a well-formed tag no runtime ships data for, so it formats in its fallback.
const makeI18n = () => createI18n({ locale: "zz", fallbackLocale: "de", exposeGlobal: false });
const fr = new Intl.NumberFormat("fr").format(1234.5);

describe("@comvi/react — formatters follow the fallback-locale chain", () => {
  it("useI18n() formats in the fallback, and an explicit locale stays single", () => {
    const i18n = makeI18n();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </I18nProvider>
    );
    const { result } = renderHook(() => useI18n(), { wrapper });

    expect(result.current.formatNumber(1234.5)).toBe("1.234,5");
    expect(result.current.formatNumber(1234.5, undefined, "fr")).toBe(fr);
    expect(result.current.formatNumber(1234.5, undefined, "zz")).toBe(
      new Intl.NumberFormat("zz").format(1234.5),
    );
  });

  it.each([
    ["useI18n", () => useI18n().formatNumber(1234.5)],
    [
      "a useMemo keyed on useI18n().formatNumber",
      () => {
        const { formatNumber } = useI18n();
        return useMemo(() => formatNumber(1234.5), [formatNumber]);
      },
    ],
    ["useFormatters", () => useFormatters().formatNumber(1234.5)],
  ])("%s() output re-renders on setFallbackLocale", async (_, read) => {
    const i18n = makeI18n();
    function Probe() {
      return <span data-testid="n">{read()}</span>;
    }
    const { getByTestId } = render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <Probe />
      </I18nProvider>,
    );
    expect(getByTestId("n").textContent).toBe("1.234,5");

    await act(async () => {
      i18n.setFallbackLocale("fr");
      await Promise.resolve();
    });

    expect(getByTestId("n").textContent).toBe(fr);
  });
});
