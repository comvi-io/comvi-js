// Plan §2.4 + §3.2 — the acquisition contract of `useI18nLoader()` /
// `useI18nPlugins()`, asserted against BOTH published build families.
//
// The dev and prod messages are written out verbatim below rather than
// imported from `missingCapability`: importing the factory would compare the
// artifact against itself and pass no matter what it says.
// `__COMVI_CORE_BUILD__` is defined per vitest project (vitest.config.ts) and
// says which core dist this run resolved.
import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { createI18nFromCore } from "../../src/createI18nFromCore";
import { useI18nLoader, useI18nPlugins } from "../../src/composables/capabilities";

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

/** Calls `composable()` in a component's setup under an installed plugin. */
function acquire(i18n, composable) {
  let acquired;
  let thrown;
  const Probe = defineComponent({
    setup() {
      try {
        acquired = composable();
      } catch (error) {
        thrown = error;
      }
      return () => h("div");
    },
  });
  const wrapper = mount(Probe, { global: { plugins: [i18n] } });
  if (thrown) throw thrown;
  return { bag: acquired, wrapper };
}

describe(`capability acquisition (${__COMVI_CORE_BUILD__} core build)`, () => {
  it("throws the exact message on a base host — loader", () => {
    expect(() => acquire(createI18nFromCore(baseHost()), useI18nLoader)).toThrow(EXPECTED.loader);
  });

  it("throws the exact message on a base host — plugins", () => {
    expect(() => acquire(createI18nFromCore(baseHost()), useI18nPlugins)).toThrow(EXPECTED.plugins);
  });

  it("throws for the capability that is missing, not the one that is present", () => {
    const loaderOnly = createI18nFromCore(attachLoader(baseHost()));

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

    const { bag } = acquire(createI18nFromCore(host), useI18nLoader);

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
    const { bag } = acquire(createI18nFromCore(host), useI18nPlugins);

    expect(Object.keys(bag)).toEqual(["onMissingKey"]);

    const off = bag.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps 0.4.x's ROOT-host reach on a fully composed host", () => {
    // 0.4.x shipped both capabilities on the root `createI18n`. 0.5.0 makes
    // them explicit, so the same reach is one composition expression — and the
    // acquisition point is the composable, exactly as it is for a partial host.
    const host = attachPlugins(attachLoader(baseHost()));
    const i18n = createI18nFromCore(host);

    expect(typeof acquire(i18n, useI18nLoader).bag.reloadTranslations).toBe("function");

    const off = acquire(i18n, useI18nPlugins).bag.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps member identity stable per host across components and re-renders (§3.2)", async () => {
    const i18n = createI18nFromCore(attachPlugins(attachLoader(baseHost())));

    const a = acquire(i18n, useI18nLoader);
    const b = acquire(i18n, useI18nLoader);

    expect(b.bag).toBe(a.bag);
    expect(b.bag.reloadTranslations).toBe(a.bag.reloadTranslations);

    // A re-mount of the same component under the same host is the vue analogue
    // of a re-render: the WeakMap keys on the host, never on the component.
    const again = acquire(i18n, useI18nLoader);
    expect(again.bag).toBe(a.bag);

    const p1 = acquire(i18n, useI18nPlugins);
    const p2 = acquire(i18n, useI18nPlugins);
    expect(p2.bag).toBe(p1.bag);
    expect(p2.bag.onMissingKey).toBe(p1.bag.onMissingKey);
  });

  it("gives DIFFERENT hosts different bags", () => {
    const one = acquire(createI18nFromCore(attachLoader(baseHost())), useI18nLoader);
    const two = acquire(createI18nFromCore(attachLoader(baseHost())), useI18nLoader);

    expect(one.bag).not.toBe(two.bag);
  });

  it("shares one bag between two VueI18n wrappers over the SAME host", () => {
    const host = attachLoader(baseHost());

    const a = acquire(createI18nFromCore(host), useI18nLoader);
    const b = acquire(createI18nFromCore(host), useI18nLoader);

    expect(b.bag).toBe(a.bag);
  });

  it("acquires the capability after a late attach on the same host", () => {
    const host = baseHost();
    const i18n = createI18nFromCore(host);

    expect(() => acquire(i18n, useI18nLoader)).toThrow(EXPECTED.loader);

    attachLoader(host);
    expect(typeof acquire(i18n, useI18nLoader).bag.reloadTranslations).toBe("function");
  });

  it("throws the install error outside an installed app", () => {
    const Probe = defineComponent({
      setup() {
        useI18nLoader();
        return () => h("div");
      },
    });

    expect(() => mount(Probe)).toThrow(
      "[i18n] useI18nLoader must be used within a Vue app with i18n plugin installed.",
    );
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
    const bag = acquire(createI18nFromCore(host), useI18nPlugins).bag;

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
    const bag = acquire(createI18nFromCore(host), useI18nPlugins).bag;

    let received;
    const off = bag.onMissingKey((...args) => {
      received = args;
    });

    host.t("absent");
    expect(received).toEqual(["absent", "en", "default"]);
    off();
  });
});
