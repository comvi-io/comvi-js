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
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { I18nProvider } from "../../src/I18nProvider";
import { useI18nLoader, useI18nPlugins } from "../../src/capabilityHooks";

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

const wrapperFor = (i18n) =>
  function Wrapper({ children }) {
    return (
      <I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </I18nProvider>
    );
  };

const baseHost = () =>
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: { greeting: "Hello" } } });

describe(`capability acquisition (${__COMVI_CORE_BUILD__} core build)`, () => {
  it("throws the exact message on a base host — loader", () => {
    const wrapper = wrapperFor(baseHost());
    expect(() => renderHook(() => useI18nLoader(), { wrapper })).toThrow(EXPECTED.loader);
  });

  it("throws the exact message on a base host — plugins", () => {
    const wrapper = wrapperFor(baseHost());
    expect(() => renderHook(() => useI18nPlugins(), { wrapper })).toThrow(EXPECTED.plugins);
  });

  it("throws for the capability that is missing, not the one that is present", () => {
    const loaderOnly = wrapperFor(attachLoader(baseHost()));
    expect(() => renderHook(() => useI18nPlugins(), { wrapper: loaderOnly })).toThrow(
      EXPECTED.plugins,
    );
    expect(() => renderHook(() => useI18nLoader(), { wrapper: loaderOnly })).not.toThrow();
  });

  it("returns a working loader bag on base + attachLoader", async () => {
    const host = attachLoader(baseHost());
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

  it("returns a working plugins bag on base + attachPlugins", () => {
    const host = attachPlugins(baseHost());
    const { result } = renderHook(() => useI18nPlugins(), { wrapper: wrapperFor(host) });

    expect(Object.keys(result.current)).toEqual(["onMissingKey"]);

    const off = result.current.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps 0.4.x's ROOT-host reach on a fully composed host", async () => {
    // 0.4.x shipped both capabilities on the root `createI18n`. 0.5.0 makes
    // them explicit, so the same reach is one composition expression — and the
    // acquisition point is the hook, exactly as it is for a partial host.
    const host = attachPlugins(attachLoader(baseHost()));
    const wrapper = wrapperFor(host);

    const loader = renderHook(() => useI18nLoader(), { wrapper });
    const plugins = renderHook(() => useI18nPlugins(), { wrapper });

    expect(typeof loader.result.current.reloadTranslations).toBe("function");
    const off = plugins.result.current.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps member identity stable per host across components and re-renders (§3.2)", () => {
    const host = attachPlugins(attachLoader(baseHost()));
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
    const one = attachLoader(baseHost());
    const two = attachLoader(baseHost());

    const a = renderHook(() => useI18nLoader(), { wrapper: wrapperFor(one) });
    const b = renderHook(() => useI18nLoader(), { wrapper: wrapperFor(two) });

    expect(a.result.current).not.toBe(b.result.current);
  });

  it("acquires the capability after a late attach on the same host", () => {
    const host = baseHost();
    const wrapper = wrapperFor(host);

    expect(() => renderHook(() => useI18nLoader(), { wrapper })).toThrow(EXPECTED.loader);

    attachLoader(host);
    const { result } = renderHook(() => useI18nLoader(), { wrapper });
    expect(typeof result.current.reloadTranslations).toBe("function");
  });

  // ── B8: ONE canonical behaviour for a non-string `onMissingKey` result ──
  //
  // The four wrappers had drifted here: react wrapped the callback and coerced
  // its result with `String(result)`; vue, solid and svelte bound the host
  // method raw. Core decides, and core's `I18nPluginHostApi["onMissingKey"]`
  // declares the callback returns `TranslationResult | void` — a string OR the
  // `Array<string | VirtualNode>` a rich-text fallback is made of — which
  // `_missHook` takes as-is. So the canonical behaviour is PASS-THROUGH; the
  // coercion invented a semantic core does not have and flattened a rich
  // fallback to `"rich-,[object Object]"` in react alone.
  //
  // The identical assertions live in all four wrapper packages
  // (`scripts/wrapper-hooks-parity.test.mjs` pins the implementation they
  // exercise), so this is the behavioural half of the parity claim.
  it("hands core a non-string onMissingKey result UNTOUCHED (B8 parity)", () => {
    const richFallback = [
      "rich-",
      { type: "element", tag: "b", props: {}, children: ["fallback"] },
    ];
    const host = attachPlugins(baseHost());
    const bag = renderHook(() => useI18nPlugins(), { wrapper: wrapperFor(host) }).result.current;

    const off = bag.onMissingKey(() => richFallback);

    // `tRaw` proves the VirtualNode survived the wrapper; `t` proves it is
    // CORE, not the wrapper, that flattens the parts to text.
    expect(host.tRaw("absent")).toEqual(richFallback);
    expect(host.t("absent")).toBe("rich-fallback");

    off();
    expect(host.t("absent")).toBe("absent");
  });

  it("registers the callback itself — the host sees no wrapper closure (B8 parity)", () => {
    const host = attachPlugins(baseHost());
    const bag = renderHook(() => useI18nPlugins(), { wrapper: wrapperFor(host) }).result.current;

    let received;
    const off = bag.onMissingKey((...args) => {
      received = args;
    });

    host.t("absent");
    expect(received).toEqual(["absent", "en", "default"]);
    off();
  });
});
