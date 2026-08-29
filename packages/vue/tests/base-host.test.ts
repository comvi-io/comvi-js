// `@comvi/vue`'s bindings on the BASE host — a host that implements
// `WrapperI18nHost` and nothing more. Nothing the wrapper does at render time
// may touch a loader/plugin member: a single eager `.bind()` of an absent
// capability would crash every case below. The composed-host parity check at
// the end keeps the two configurations from drifting into different
// `useI18n()` shapes.
//
// The loud-error half of the contract (exact dev AND prod messages) lives in
// tests/js-contract/, against the published dist under both build conditions.
import { describe, it, expect } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import {
  attachLoader,
  attachPlugins,
  createCore,
  createI18nFromCore,
  T,
  useI18n,
} from "../src/index";
import type { AnyVueI18n } from "../src/index";

const baseHost = () =>
  createCore({
    locale: "en",
    exposeGlobal: false,
    defaultNs: "common",
    translation: {
      en: { greeting: "Hello, {name}!", tagged: "a <b>c</b> d" },
      fr: { greeting: "Bonjour, {name} !", tagged: "a <b>c</b> d" },
    },
  });

describe("vue on a base host", () => {
  it("translates and stays reactive across a locale switch", async () => {
    const i18n = createI18nFromCore(baseHost());
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
    const i18n = createI18nFromCore(baseHost());

    // The host locale is "en" and the date carries an explicit `timeZone`, so
    // every literal below is a function of the fixture alone.
    expect(i18n.formatNumber(1234.5)).toBe("1,234.5");
    expect(i18n.formatCurrency(12, "USD")).toBe("$12.00");
    expect(i18n.formatDate(new Date("2026-08-02T00:00:00Z"), { timeZone: "UTC" })).toBe("8/2/2026");
    expect(i18n.formatRelativeTime(-1, "day")).toBe("1 day ago");
    expect(i18n.dir.value).toBe("ltr");
  });

  it("accepts runtime translations and reflects them in the cache refs", async () => {
    const i18n = createI18nFromCore(baseHost());

    i18n.addTranslations({ "en:common": { late: "Late" } });
    await nextTick();

    expect(i18n.t("late")).toBe("Late");
    expect(i18n.hasTranslationNow("late")).toBe(true);
    expect(i18n.loadedLocales.value).toContain("en");
  });

  it("renders <T> with tag interpolation — the per-call extension path", () => {
    const i18n = createI18nFromCore(baseHost());
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

  it("leaves the same markup literal through t() — <T> registers nothing", () => {
    // `<T>` passes the tag grammar per call, so rendering it above cannot have
    // made `<b>` ambient for the string API.
    const i18n = createI18nFromCore(baseHost());

    expect(i18n.t("tagged")).toBe("a <b>c</b> d");
  });

  it("initializes and destroys without a loader capability", async () => {
    const i18n = createI18nFromCore(baseHost());

    await i18n.init();
    expect(i18n.isLoading.value).toBe(false);
    expect(i18n.isInitializing.value).toBe(false);

    i18n.destroy();

    // The unit project resolves ../src with __DEV__ true, so only the dev
    // message is reachable here; the prod text is pinned in tests/js-contract/.
    await expect(i18n.init()).rejects.toThrow(
      "[i18n] Cannot call init() after destroy(). Create a new i18n instance.",
    );
  });

  it("has no use() anywhere on a base host — wrapper or core", () => {
    const i18n = createI18nFromCore(baseHost());

    // No member of VueI18n is typed present and then throws "missing
    // capability"; plugin registration is a capability, absent from the host.
    expect("use" in i18n).toBe(false);
    expect((i18n as unknown as Record<string, unknown>).use).toBeUndefined();
    expect("use" in i18n.core).toBe(false);
  });

  it("registers a plugin through i18n.core.use() once the capability is attached", async () => {
    const host = attachPlugins(baseHost());
    const i18n = createI18nFromCore(host);
    let installed = false;

    // The plugin body must be a STATEMENT block: core's plugin-init contract
    // rejects a return value that is neither void nor a cleanup function, and
    // an expression-bodied `() => (installed = true)` returns `true`.
    expect(
      i18n.core.use(() => {
        installed = true;
      }),
    ).toBe(host);
    await i18n.init();
    expect(installed).toBe(true);
  });

  it("adopts ssrLocale as the host locale, so the ref and the core agree", () => {
    const host = baseHost();
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

    const baseKeys = keysFor(createI18nFromCore(baseHost()));

    // Anchored: an empty bag on both paths would satisfy the equality below.
    expect(baseKeys).toContain("t");
    expect(keysFor(createI18nFromCore(attachPlugins(attachLoader(baseHost()))))).toEqual(baseKeys);
  });
});
