// The acquisition contract of `useI18nLoader()` / `useI18nPlugins()`, asserted
// against BOTH published build families.
//
// The dev and prod messages are written out verbatim below rather than
// imported from `missingCapability`: importing the factory would compare the
// artifact against itself and pass no matter what it says.
// `__COMVI_CORE_BUILD__` is defined per vitest project and says which core
// dist this run resolved.
//
// Svelte specific: these are context READERS, not stores — called during
// component initialisation, so the throw surfaces out of `mount()`, and what
// they return is a plain object of bound functions.
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mount, unmount } from "svelte";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { useI18nLoader, useI18nPlugins } from "../../src/capabilities";
import HostProbe from "./HostProbe.test.svelte";

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

const baseHost = () =>
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: { greeting: "Hello" } } });

describe(`capability acquisition (${__COMVI_CORE_BUILD__} core build)`, () => {
  let target;
  const mounted = [];

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    for (const component of mounted.splice(0)) unmount(component);
    target.remove();
  });

  /** Mounts a probe that acquires `read()` during init and returns the bag. */
  const acquire = (i18n, read) => {
    let bag;
    mounted.push(
      mount(HostProbe, { target, props: { i18n, read, report: (value) => (bag = value) } }),
    );
    return bag;
  };

  it("throws the exact message on a base host — loader", () => {
    expect(() => acquire(baseHost(), useI18nLoader)).toThrow(EXPECTED.loader);
  });

  it("throws the exact message on a base host — plugins", () => {
    expect(() => acquire(baseHost(), useI18nPlugins)).toThrow(EXPECTED.plugins);
  });

  it("throws for the capability that is missing, not the one that is present", () => {
    const loaderOnly = attachLoader(baseHost());

    expect(() => acquire(loaderOnly, useI18nPlugins)).toThrow(EXPECTED.plugins);
    expect(() => acquire(loaderOnly, useI18nLoader)).not.toThrow();
  });

  it("returns a working loader bag on base + attachLoader", async () => {
    const host = attachLoader(baseHost());
    const loaded = [];
    host.registerLoader(async (locale, ns) => {
      loaded.push(`${locale}:${ns}`);
      return { extra: "loaded" };
    });

    const bag = acquire(host, useI18nLoader);

    expect(Object.keys(bag).sort()).toEqual([
      "addActiveNamespace",
      "addActiveNamespaces",
      "onLoadError",
      "reloadTranslations",
    ]);

    await bag.addActiveNamespace("dashboard");
    expect(loaded).toContain("en:dashboard");

    const off = bag.onLoadError(() => {});
    expect(typeof off).toBe("function");
    off();
  });

  it("returns a working plugins bag on base + attachPlugins", () => {
    const host = attachPlugins(baseHost());
    const bag = acquire(host, useI18nPlugins);

    expect(Object.keys(bag)).toEqual(["onMissingKey"]);

    const off = bag.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps 0.4.x's ROOT-host reach on a fully composed host", () => {
    // Both capabilities composed at once: the acquisition point is still the
    // reader, exactly as it is for a partial host.
    const host = attachPlugins(attachLoader(baseHost()));

    const loader = acquire(host, useI18nLoader);
    const plugins = acquire(host, useI18nPlugins);

    expect(typeof loader.reloadTranslations).toBe("function");
    const off = plugins.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps member identity stable per host across components (§3.2)", () => {
    const host = attachPlugins(attachLoader(baseHost()));

    const a = acquire(host, useI18nLoader);
    const b = acquire(host, useI18nLoader);
    expect(b).toBe(a);
    expect(b.reloadTranslations).toBe(a.reloadTranslations);

    const p1 = acquire(host, useI18nPlugins);
    const p2 = acquire(host, useI18nPlugins);
    expect(p2).toBe(p1);
    expect(p2.onMissingKey).toBe(p1.onMissingKey);
  });

  it("gives DIFFERENT hosts different bags", () => {
    expect(acquire(attachLoader(baseHost()), useI18nLoader)).not.toBe(
      acquire(attachLoader(baseHost()), useI18nLoader),
    );
  });

  it("acquires the capability after a late attach on the same host", () => {
    const host = baseHost();

    expect(() => acquire(host, useI18nLoader)).toThrow(EXPECTED.loader);

    attachLoader(host);
    expect(typeof acquire(host, useI18nLoader).reloadTranslations).toBe("function");
  });

  it("returns plain bound functions, not stores (§3.2 svelte idiom)", () => {
    const bag = acquire(attachLoader(baseHost()), useI18nLoader);

    for (const member of Object.values(bag)) {
      expect(typeof member).toBe("function");
      expect(member.subscribe).toBeUndefined();
    }
  });

  // ONE canonical behaviour for a non-string `onMissingKey` result:
  // PASS-THROUGH. Core's `I18nPluginHostApi["onMissingKey"]` declares the
  // callback returns `TranslationResult | void`, and `_missHook` takes it
  // as-is. React once coerced it with `String(result)`, flattening a rich
  // fallback to `"rich-,[object Object]"` in one wrapper alone.
  //
  // The identical assertions live in all four wrapper packages — the
  // behavioural half of what `scripts/wrapper-hooks-parity.test.mjs` pins.
  it("hands core a non-string onMissingKey result UNTOUCHED (B8 parity)", () => {
    const richFallback = [
      "rich-",
      { type: "element", tag: "b", props: {}, children: ["fallback"] },
    ];
    const host = attachPlugins(baseHost());
    const bag = acquire(host, useI18nPlugins);

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
    const bag = acquire(host, useI18nPlugins);

    let received;
    const off = bag.onMissingKey((...args) => {
      received = args;
    });

    host.t("absent");
    expect(received).toEqual(["absent", "en", "default"]);
    off();
  });
});
