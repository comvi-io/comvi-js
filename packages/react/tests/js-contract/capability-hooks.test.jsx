// Plan §2.4 + §3.2 — the acquisition contract of `useI18nLoader()` /
// `useI18nPlugins()`, asserted against BOTH published build families.
//
// The dev and prod messages are written out verbatim below rather than
// imported from `missingCapability`: importing the factory would compare the
// artifact against itself and pass no matter what it says. `__COMVI_CORE_BUILD__`
// is defined per vitest project (vitest.config.ts) and says which core dist
// this run resolved.
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { createI18n as createRootI18n } from "@comvi/core";
import { I18nProvider } from "../../src/I18nProvider";
import { useI18nLoader, useI18nPlugins } from "../../src/capabilityHooks";

/* global __COMVI_CORE_BUILD__ */
const IS_DEV_BUILD = __COMVI_CORE_BUILD__ === "development";

const EXPECTED = {
  loader: IS_DEV_BUILD
    ? '[comvi] This i18n instance has no loader capability. Attach it: import { attachLoader } from "@comvi/core/loader" — or use the root "@comvi/core" entry.'
    : "[comvi] missing loader capability — attach @comvi/core/loader",
  plugins: IS_DEV_BUILD
    ? '[comvi] This i18n instance has no plugins capability. Attach it: import { attachPlugins } from "@comvi/core/plugins" — or use the root "@comvi/core" entry.'
    : "[comvi] missing plugins capability — attach @comvi/core/plugins",
};

const wrapperFor = (i18n) =>
  function Wrapper({ children }) {
    return (
      <I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </I18nProvider>
    );
  };

const bareSlim = () =>
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: { greeting: "Hello" } } });

describe(`capability acquisition (${__COMVI_CORE_BUILD__} core build)`, () => {
  it("throws the exact message on a bare-slim host — loader", () => {
    const wrapper = wrapperFor(bareSlim());
    expect(() => renderHook(() => useI18nLoader(), { wrapper })).toThrow(EXPECTED.loader);
  });

  it("throws the exact message on a bare-slim host — plugins", () => {
    const wrapper = wrapperFor(bareSlim());
    expect(() => renderHook(() => useI18nPlugins(), { wrapper })).toThrow(EXPECTED.plugins);
  });

  it("throws for the capability that is missing, not the one that is present", () => {
    const loaderOnly = wrapperFor(attachLoader(bareSlim()));
    expect(() => renderHook(() => useI18nPlugins(), { wrapper: loaderOnly })).toThrow(
      EXPECTED.plugins,
    );
    expect(() => renderHook(() => useI18nLoader(), { wrapper: loaderOnly })).not.toThrow();
  });

  it("returns a working loader bag on slim + attachLoader", async () => {
    const host = attachLoader(bareSlim());
    const loaded = [];
    host.registerLoader(async (locale, ns) => {
      loaded.push(`${locale}:${ns}`);
      return { extra: "loaded" };
    });

    const { result } = renderHook(() => useI18nLoader(), { wrapper: wrapperFor(host) });

    expect(Object.keys(result.current).sort()).toEqual([
      "addActiveNamespace",
      "addActiveNamespaces",
      "onLoadError",
      "reloadTranslations",
    ]);

    await result.current.addActiveNamespace("dashboard");
    expect(loaded).toContain("en:dashboard");

    const errors = [];
    const off = result.current.onLoadError((locale, ns, error) => errors.push([locale, ns, error]));
    expect(typeof off).toBe("function");
    off();
  });

  it("returns a working plugins bag on slim + attachPlugins", () => {
    const host = attachPlugins(bareSlim());
    const { result } = renderHook(() => useI18nPlugins(), { wrapper: wrapperFor(host) });

    expect(Object.keys(result.current)).toEqual(["onMissingKey"]);

    const off = result.current.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("works on a ROOT host — 0.4.x behaviour, new acquisition point", async () => {
    const host = createRootI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });
    const wrapper = wrapperFor(host);

    const loader = renderHook(() => useI18nLoader(), { wrapper });
    const plugins = renderHook(() => useI18nPlugins(), { wrapper });

    expect(typeof loader.result.current.reloadTranslations).toBe("function");
    const off = plugins.result.current.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps member identity stable per host across components and re-renders (§3.2)", () => {
    const host = attachPlugins(attachLoader(bareSlim()));
    const wrapper = wrapperFor(host);

    const a = renderHook(() => useI18nLoader(), { wrapper });
    const b = renderHook(() => useI18nLoader(), { wrapper });
    const first = a.result.current;

    expect(b.result.current).toBe(first);
    expect(b.result.current.reloadTranslations).toBe(first.reloadTranslations);

    a.rerender();
    expect(a.result.current).toBe(first);

    const p1 = renderHook(() => useI18nPlugins(), { wrapper });
    const p2 = renderHook(() => useI18nPlugins(), { wrapper });
    expect(p2.result.current).toBe(p1.result.current);
    expect(p2.result.current.onMissingKey).toBe(p1.result.current.onMissingKey);
  });

  it("gives DIFFERENT hosts different bags", () => {
    const one = attachLoader(bareSlim());
    const two = attachLoader(bareSlim());

    const a = renderHook(() => useI18nLoader(), { wrapper: wrapperFor(one) });
    const b = renderHook(() => useI18nLoader(), { wrapper: wrapperFor(two) });

    expect(a.result.current).not.toBe(b.result.current);
  });

  it("acquires the capability after a late attach on the same host", () => {
    const host = bareSlim();
    const wrapper = wrapperFor(host);

    expect(() => renderHook(() => useI18nLoader(), { wrapper })).toThrow(EXPECTED.loader);

    attachLoader(host);
    const { result } = renderHook(() => useI18nLoader(), { wrapper });
    expect(typeof result.current.reloadTranslations).toBe("function");
  });
});
