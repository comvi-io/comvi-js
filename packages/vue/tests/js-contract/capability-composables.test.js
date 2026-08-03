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
import { createI18n as createRootI18n } from "@comvi/core";
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

const bareSlim = () =>
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
  it("throws the exact message on a bare-slim host — loader", () => {
    expect(() => acquire(createI18nFromCore(bareSlim()), useI18nLoader)).toThrow(EXPECTED.loader);
  });

  it("throws the exact message on a bare-slim host — plugins", () => {
    expect(() => acquire(createI18nFromCore(bareSlim()), useI18nPlugins)).toThrow(EXPECTED.plugins);
  });

  it("throws for the capability that is missing, not the one that is present", () => {
    const loaderOnly = createI18nFromCore(attachLoader(bareSlim()));

    expect(() => acquire(loaderOnly, useI18nPlugins)).toThrow(EXPECTED.plugins);
    expect(() => acquire(loaderOnly, useI18nLoader)).not.toThrow();
  });

  it("returns a working loader bag on slim + attachLoader", async () => {
    const host = attachLoader(bareSlim());
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

  it("returns a working plugins bag on slim + attachPlugins", () => {
    const host = attachPlugins(bareSlim());
    const { bag } = acquire(createI18nFromCore(host), useI18nPlugins);

    expect(Object.keys(bag)).toEqual(["onMissingKey"]);

    const off = bag.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("works on a ROOT host — 0.4.x behaviour, new acquisition point", () => {
    const host = createRootI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });
    const i18n = createI18nFromCore(host);

    expect(typeof acquire(i18n, useI18nLoader).bag.reloadTranslations).toBe("function");

    const off = acquire(i18n, useI18nPlugins).bag.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
  });

  it("keeps member identity stable per host across components and re-renders (§3.2)", async () => {
    const i18n = createI18nFromCore(attachPlugins(attachLoader(bareSlim())));

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
    const one = acquire(createI18nFromCore(attachLoader(bareSlim())), useI18nLoader);
    const two = acquire(createI18nFromCore(attachLoader(bareSlim())), useI18nLoader);

    expect(one.bag).not.toBe(two.bag);
  });

  it("shares one bag between two VueI18n wrappers over the SAME host", () => {
    const host = attachLoader(bareSlim());

    const a = acquire(createI18nFromCore(host), useI18nLoader);
    const b = acquire(createI18nFromCore(host), useI18nLoader);

    expect(b.bag).toBe(a.bag);
  });

  it("acquires the capability after a late attach on the same host", () => {
    const host = bareSlim();
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
});
