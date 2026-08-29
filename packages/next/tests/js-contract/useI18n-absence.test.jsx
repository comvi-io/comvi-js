// The JS-consumer contract, next-harness pass.
//
// The react package proves the contract for its own provider; this file proves
// that nothing in `@comvi/next/client` re-adds the four members or softens their
// absence. Deliberately `.jsx`: a TS file would hide the runtime shape behind
// compile errors. Run against BOTH core build families, which is also what makes
// the capability messages below differ.
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createI18n } from "@comvi/core";
import { attachLoader, loader as loaderInstaller } from "@comvi/core/loader";
import { attachPlugins, plugins as pluginsInstaller } from "@comvi/core/plugins";
import { useI18n, useI18nLoader, useI18nPlugins } from "../../src/client";
import { I18nProvider } from "../../src/client/I18nProvider";

/* global __COMVI_CORE_BUILD__ */
const IS_DEV_BUILD = __COMVI_CORE_BUILD__ === "development";

const EXPECTED = {
  loader: IS_DEV_BUILD
    ? '[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.'
    : "[comvi] missing loader capability — attach @comvi/core/loader",
  plugins: IS_DEV_BUILD
    ? '[comvi] This i18n instance has no plugins capability. Compose it: .with(plugins()) from "@comvi/core/plugins", or the lower-level attachPlugins.'
    : "[comvi] missing plugins capability — attach @comvi/core/plugins",
};

const CAPABILITY_MEMBERS = [
  "addActiveNamespace",
  "reloadTranslations",
  "onLoadError",
  "onMissingKey",
];

const baseHost = () =>
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: { greeting: "Hello" } } });

const wrapperFor = (i18n) =>
  function Wrapper({ children }) {
    return (
      <I18nProvider i18n={i18n} locale="en" autoInit={false}>
        {children}
      </I18nProvider>
    );
  };

const renderUseI18n = (i18n) =>
  renderHook(() => useI18n(), { wrapper: wrapperFor(i18n) }).result.current;

describe.each([
  ["bare base", baseHost],
  ["base + loader + plugins", () => attachPlugins(attachLoader(baseHost()))],
])("useI18n() through @comvi/next/client on a %s host", (_label, makeHost) => {
  it("does not expose the capability members under a pure destructure", () => {
    const { reloadTranslations, addActiveNamespace, onLoadError } = renderUseI18n(makeHost());

    expect(reloadTranslations).toBeUndefined();
    expect(addActiveNamespace).toBeUndefined();
    expect(onLoadError).toBeUndefined();
    expect(() => reloadTranslations()).toThrow(TypeError);
  });

  it("keeps the common members working in a mixed destructure", () => {
    const { t, onMissingKey } = renderUseI18n(makeHost());

    expect(t("greeting")).toBe("Hello");
    expect(onMissingKey).toBeUndefined();
  });

  it("does not expose them under an aliased destructure", () => {
    const { reloadTranslations: reload } = renderUseI18n(makeHost());

    expect(reload).toBeUndefined();
  });

  it("does not expose them under property access", () => {
    const bag = renderUseI18n(makeHost());

    expect(bag.onLoadError).toBeUndefined();
    expect(bag.onMissingKey).toBeUndefined();
  });

  it("reports the members as absent, not merely undefined", () => {
    const bag = renderUseI18n(makeHost());

    for (const member of CAPABILITY_MEMBERS) {
      expect(member in bag).toBe(false);
    }
  });
});

describe(`capability acquisition through @comvi/next/client (${__COMVI_CORE_BUILD__} core build)`, () => {
  it("throws the exact loader message on a bare base host", () => {
    const wrapper = wrapperFor(baseHost());

    expect(() => renderHook(() => useI18nLoader(), { wrapper })).toThrow(EXPECTED.loader);
  });

  it("throws the exact plugins message on a bare base host", () => {
    const wrapper = wrapperFor(baseHost());

    expect(() => renderHook(() => useI18nPlugins(), { wrapper })).toThrow(EXPECTED.plugins);
  });

  it("returns working bags on a composed base host", () => {
    const wrapper = wrapperFor(attachPlugins(attachLoader(baseHost())));

    const loader = renderHook(() => useI18nLoader(), { wrapper }).result.current;
    const plugins = renderHook(() => useI18nPlugins(), { wrapper }).result.current;

    expect(Object.keys(loader).sort()).toEqual([
      "addActiveNamespace",
      "addActiveNamespaces",
      "onLoadError",
      "reloadTranslations",
    ]);
    expect(Object.keys(plugins)).toEqual(["onMissingKey"]);
  });

  it("returns working bags on a host composed through the installers", () => {
    // The other acquisition path: `.with(loader()).with(plugins())` instead of
    // the low-level `attach*` calls above.
    const wrapper = wrapperFor(
      createI18n({ locale: "en", exposeGlobal: false, translation: { en: {} } })
        .with(loaderInstaller())
        .with(pluginsInstaller()),
    );

    expect(() => renderHook(() => useI18nLoader(), { wrapper })).not.toThrow();
    expect(() => renderHook(() => useI18nPlugins(), { wrapper })).not.toThrow();
  });
});
