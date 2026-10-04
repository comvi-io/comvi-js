// The JS-consumer contract for the members that left `useI18n()` and the
// proxies that left the `VueI18n` instance.
//
// Deliberately .js, not .ts: a TypeScript file would fail to compile on every
// shape below, which proves nothing about what a JavaScript consumer
// experiences at runtime. Run by BOTH the `js-contract-dev` and
// `js-contract-prod` vitest projects, which pin `@comvi/core*` to the dev and
// prod build family respectively.
import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { createI18nFromCore } from "../../src/createI18nFromCore";
import { useI18n } from "../../src/composables/useI18n";

const baseHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    messages: { en: { greeting: "Hello" } },
  });

const composedHost = () => attachPlugins(attachLoader(baseHost()));

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

const CAPABILITY_MEMBERS = ["addActiveNamespace", "reloadMessages", "onLoadError", "onMissingKey"];

// A capability-CARRYING host must behave exactly like the base one here: the
// members are gone from `useI18n()` by absence, not by host sniffing.
describe.each([
  ["base host", baseHost],
  ["base + attachLoader + attachPlugins", composedHost],
])("useI18n() capability-member absence (%s)", (_label, makeHost) => {
  const render = (body) => inSetup(createI18nFromCore(makeHost()), body);

  it("pure destructure yields undefined and calling it is a TypeError", () => {
    render((bag) => {
      const { reloadMessages } = bag;

      expect(reloadMessages).toBeUndefined();
      expect(() => reloadMessages()).toThrow(TypeError);
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
      const { reloadMessages: r, addActiveNamespace: addNs } = bag;

      expect(r).toBeUndefined();
      expect(addNs).toBeUndefined();
    });
  });

  it("property access yields undefined", () => {
    render((bag) => {
      expect(CAPABILITY_MEMBERS.filter((name) => bag[name] !== undefined)).toEqual([]);
    });
  });

  it("does not carry the members as own or inherited keys", () => {
    render((bag) => {
      expect(CAPABILITY_MEMBERS.filter((name) => name in bag)).toEqual([]);
    });
  });
});

// The vue-specific half: the instance proxies are gone from VueI18n, and the
// same operations are reachable through `i18n.core` on a host that has the
// capability. `registerPlugin` is on the list too — a proxy typed present that
// throws "missing capability" is the failure class this contract exists to
// prevent. `use` is NOT on it: the wrapper's `use` is the composition verb,
// which is the wrapper's own member and takes an installer, not a plugin.
const DROPPED_PROXIES = [
  "addActiveNamespace",
  "reloadMessages",
  "registerLoader",
  "registerLocaleDetector",
  "registerPostProcessor",
  "onMissingKey",
  "onLoadError",
  "registerPlugin",
];

describe("VueI18n dropped instance proxies", () => {
  it.each(DROPPED_PROXIES)("%s is absent from the instance", (name) => {
    // Even on a fully composed host: absence is by design, not host sniffing.
    const i18n = createI18nFromCore(composedHost());

    expect(name in i18n).toBe(false);
    expect(i18n[name]).toBeUndefined();
  });

  it("exposes the same operations on i18n.core when the host has them", async () => {
    const host = composedHost();
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

    let pluginRan = false;
    // A STATEMENT body: core's plugin-init contract rejects a return value
    // that is neither void nor a cleanup function, and an expression-bodied
    // `() => (pluginRan = true)` returns `true`.
    expect(
      i18n.core.registerPlugin(() => {
        pluginRan = true;
      }),
    ).toBe(host);
    await i18n.init();
    expect(pluginRan).toBe(true);
  });

  it("is the injected host itself, not a copy", () => {
    const host = baseHost();

    expect(createI18nFromCore(host).core).toBe(host);
  });
});
