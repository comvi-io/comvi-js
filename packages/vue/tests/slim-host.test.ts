// @comvi/vue running on a BARE `@comvi/core` host (framework-slim P4).
//
// Everything here is reachable without the loader or plugin-host capability:
// if any of it regressed, the wrapper would be pulling a member a slim host
// does not have, and the whole point of the D′ split would be lost. The
// composed-host parity check at the end is what keeps the two configurations
// from drifting into different `useI18n()` shapes.
import { describe, it, expect } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n as createSlimI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { createI18nFromCore } from "../src/createI18nFromCore";
import type { AnyVueI18n } from "../src/VueI18n";
import { useI18n } from "../src/composables/useI18n";
import { T } from "../src/components/T";

const bareSlim = () =>
  createSlimI18n({
    locale: "en",
    exposeGlobal: false,
    defaultNs: "common",
    translation: {
      en: { greeting: "Hello, {name}!", tagged: "a <b>c</b> d" },
      fr: { greeting: "Bonjour, {name} !", tagged: "a <b>c</b> d" },
    },
  });

describe("vue on a bare slim host", () => {
  it("translates and stays reactive across a locale switch", async () => {
    const i18n = createI18nFromCore(bareSlim());
    const wrapper = mount(
      defineComponent({
        setup() {
          const { t, locale } = useI18n();
          return () => h("div", `${locale.value}:${t("greeting", { name: "Ada" })}`);
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(wrapper.text()).toBe("en:Hello, Ada!");

    await i18n.setLocale("fr");
    await nextTick();

    expect(wrapper.text()).toBe("fr:Bonjour, Ada !");
  });

  it("exposes the formatters and the direction ref", () => {
    const i18n = createI18nFromCore(bareSlim());

    expect(i18n.formatNumber(1234.5)).toBe(new Intl.NumberFormat("en").format(1234.5));
    expect(i18n.formatCurrency(12, "USD")).toContain("12");
    expect(i18n.formatDate(new Date("2026-08-02T00:00:00Z"))).toBeTypeOf("string");
    expect(i18n.formatRelativeTime(-1, "day")).toBeTypeOf("string");
    expect(i18n.dir.value).toBe("ltr");
  });

  it("accepts runtime translations and reflects them in the cache refs", async () => {
    const i18n = createI18nFromCore(bareSlim());

    i18n.addTranslations({ "en:common": { late: "Late" } });
    await nextTick();

    expect(i18n.t("late")).toBe("Late");
    expect(i18n.hasTranslationNow("late")).toBe(true);
    expect(i18n.loadedLocales.value).toContain("en");
  });

  it("renders <T> with tag interpolation — the per-call extension path", () => {
    const i18n = createI18nFromCore(bareSlim());
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h("span", [
              h(T, { i18nKey: "tagged", components: { b: "strong" } } as Record<string, unknown>),
            ]);
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(wrapper.html()).toContain("<strong>c</strong>");
  });

  it("initializes and destroys without a loader capability", async () => {
    const i18n = createI18nFromCore(bareSlim());

    await i18n.init();
    expect(i18n.isLoading.value).toBe(false);
    expect(i18n.isInitializing.value).toBe(false);

    i18n.destroy();
  });

  it("has no use() anywhere on a bare host — wrapper or core", () => {
    const i18n = createI18nFromCore(bareSlim());

    // P6 removed the guarded proxy: no member of VueI18n is typed present and
    // then throws "missing capability" (§2.4). Plugin registration is a
    // `@comvi/core/plugins` capability, so it is absent from the host too.
    expect("use" in i18n).toBe(false);
    expect((i18n as unknown as Record<string, unknown>).use).toBeUndefined();
    expect("use" in i18n.core).toBe(false);
  });

  it("registers a plugin through i18n.core.use() once the capability is attached", async () => {
    const host = attachPlugins(bareSlim());
    const i18n = createI18nFromCore(host);
    let installed = false;

    // `use()` registers on the host; core runs plugins at init().
    expect(i18n.core.use(() => (installed = true))).toBe(host);
    await i18n.init();
    expect(installed).toBe(true);
  });

  it("adopts ssrLocale as the host locale, so the ref and the core agree", () => {
    const host = bareSlim();
    const i18n = createI18nFromCore(host, { ssrLocale: "fr" });

    expect(host.locale).toBe("fr");
    expect(i18n.locale.value).toBe("fr");
    expect(i18n.t("greeting", { name: "Ada" })).toBe("Bonjour, Ada !");
  });

  it("gives a composed host an identical useI18n() key set", () => {
    const keysFor = (i18n: AnyVueI18n) => {
      let keys: string[] = [];
      mount(
        defineComponent({
          setup() {
            keys = Object.keys(useI18n()).sort();
            return () => h("div");
          },
        }),
        { global: { plugins: [i18n] } },
      );
      return keys;
    };

    expect(keysFor(createI18nFromCore(attachPlugins(attachLoader(bareSlim()))))).toEqual(
      keysFor(createI18nFromCore(bareSlim())),
    );
  });
});
