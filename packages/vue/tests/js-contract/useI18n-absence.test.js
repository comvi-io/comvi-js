// Plan §2.4 — the JS-consumer contract for the four members that LEFT
// `useI18n()` in 0.5.0, plus the seven proxies that left the `VueI18n`
// instance.
//
// Deliberately .js, not .ts: a TypeScript file would fail to compile on every
// shape below, which proves nothing about what a JavaScript consumer
// experiences at runtime. Run by BOTH the `js-contract-dev` and
// `js-contract-prod` vitest projects, which pin `@comvi/core*` to the dev and
// prod build family respectively (vitest.config.ts).
import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { createI18nFromCore } from "../../src/createI18nFromCore";
import { useI18n } from "../../src/composables/useI18n";

const bareSlim = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: { greeting: "Hello" } },
  });

const capableSlim = () => attachPlugins(attachLoader(bareSlim()));

/** Runs `body(useI18n())` inside a real component under an installed plugin. */
function inSetup(i18n, body) {
  let thrown;
  const Probe = defineComponent({
    setup() {
      try {
        body(useI18n());
      } catch (error) {
        thrown = error;
      }
      return () => h("div");
    },
  });
  mount(Probe, { global: { plugins: [i18n] } });
  if (thrown) throw thrown;
}

const CAPABILITY_MEMBERS = [
  "addActiveNamespace",
  "reloadTranslations",
  "onLoadError",
  "onMissingKey",
];

// A capability-CARRYING host must behave exactly like the bare one here: the
// members are gone from `useI18n()` by absence, not by host sniffing.
describe.each([
  ["bare slim host", bareSlim],
  ["slim + attachLoader + attachPlugins", capableSlim],
])("useI18n() capability-member absence (%s)", (_label, makeHost) => {
  const render = (body) => inSetup(createI18nFromCore(makeHost()), body);

  it("pure destructure yields undefined and calling it is a TypeError", () => {
    render((bag) => {
      const { reloadTranslations } = bag;

      expect(reloadTranslations).toBeUndefined();
      expect(() => reloadTranslations()).toThrow(TypeError);
    });
  });

  it("mixed destructure keeps the common members working", () => {
    render((bag) => {
      const { t, onMissingKey } = bag;

      expect(t("greeting")).toBe("Hello");
      expect(onMissingKey).toBeUndefined();
    });
  });

  it("aliased destructure yields undefined", () => {
    render((bag) => {
      const { reloadTranslations: r, addActiveNamespace: addNs } = bag;

      expect(r).toBeUndefined();
      expect(addNs).toBeUndefined();
    });
  });

  it("property access yields undefined", () => {
    render((bag) => {
      for (const name of CAPABILITY_MEMBERS) {
        expect(bag[name]).toBeUndefined();
      }
    });
  });

  it("does not carry the members as own or inherited keys", () => {
    render((bag) => {
      for (const name of CAPABILITY_MEMBERS) {
        expect(name in bag).toBe(false);
      }
    });
  });
});

// The vue-specific half of §2.4: the SEVEN instance proxies are gone from
// VueI18n, and the same operations are reachable through `i18n.core` on a host
// that has the capability.
const DROPPED_PROXIES = [
  "addActiveNamespace",
  "reloadTranslations",
  "registerLoader",
  "registerLocaleDetector",
  "registerPostProcessor",
  "onMissingKey",
  "onLoadError",
];

describe("VueI18n dropped instance proxies", () => {
  it.each(DROPPED_PROXIES)("%s is absent from the instance", (name) => {
    // Even on a fully composed host: absence is by design, not host sniffing.
    const i18n = createI18nFromCore(capableSlim());

    expect(name in i18n).toBe(false);
    expect(i18n[name]).toBeUndefined();
  });

  it("exposes the same operations on i18n.core when the host has them", async () => {
    const host = capableSlim();
    const i18n = createI18nFromCore(host);
    const loaded = [];
    i18n.core.registerLoader(async (locale, ns) => {
      loaded.push(`${locale}:${ns}`);
      return { title: "Admin" };
    });

    await i18n.core.addActiveNamespace("admin");
    expect(loaded).toContain("en:admin");

    const off = i18n.core.onMissingKey((key) => `[${key}]`);
    expect(i18n.t("nope")).toBe("[nope]");
    off();
  });

  it("is the injected host itself, not a copy", () => {
    const host = bareSlim();

    expect(createI18nFromCore(host).core).toBe(host);
  });
});
