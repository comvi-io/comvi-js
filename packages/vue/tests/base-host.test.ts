// `@comvi/vue`'s bindings on the BASE host.
//
// This is the D′ endpoint: the host implements `WrapperI18nHost` and nothing
// more, which is exactly what `createCore` — and vue's own one-call
// `createI18n` — from the single `@comvi/vue` entry builds. Everything
// `useI18n()` still returns must work on it, and nothing the wrapper does at
// render time may touch a loader/plugin member: a single eager `.bind()` of an
// absent capability would crash every case below. The composed-host parity
// check at the end is what keeps the two configurations from drifting into
// different `useI18n()` shapes.
//
// Every specifier here is the root entry, the way an app writes it: the host,
// the bindings and the `attachLoader`/`attachPlugins` composition all come from
// one package.
//
// The loud-error side of the contract (exact dev AND prod messages) lives in
// tests/js-contract/, which runs against the published dist under both build
// conditions.
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

    expect(i18n.formatNumber(1234.5)).toBe(new Intl.NumberFormat("en").format(1234.5));
    expect(i18n.formatCurrency(12, "USD")).toContain("12");
    expect(i18n.formatDate(new Date("2026-08-02T00:00:00Z"))).toBeTypeOf("string");
    expect(i18n.formatRelativeTime(-1, "day")).toBeTypeOf("string");
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
    // `<T>` reaches the PURE `@comvi/core/rich-text` seam and passes the tag
    // grammar per call, so rendering it above cannot have made `<b>` ambient
    // for the string API. That residual is documented, not a bug.
    const i18n = createI18nFromCore(baseHost());

    expect(i18n.t("tagged")).toBe("a <b>c</b> d");
  });

  it("initializes and destroys without a loader capability", async () => {
    const i18n = createI18nFromCore(baseHost());

    await i18n.init();
    expect(i18n.isLoading.value).toBe(false);
    expect(i18n.isInitializing.value).toBe(false);

    i18n.destroy();
  });

  it("has no use() anywhere on a base host — wrapper or core", () => {
    const i18n = createI18nFromCore(baseHost());

    // P6 removed the guarded proxy: no member of VueI18n is typed present and
    // then throws "missing capability" (§2.4). Plugin registration is a
    // `@comvi/core/plugins` capability, so it is absent from the host too.
    expect("use" in i18n).toBe(false);
    expect((i18n as unknown as Record<string, unknown>).use).toBeUndefined();
    expect("use" in i18n.core).toBe(false);
  });

  it("registers a plugin through i18n.core.use() once the capability is attached", async () => {
    const host = attachPlugins(baseHost());
    const i18n = createI18nFromCore(host);
    let installed = false;

    // `use()` registers on the host; core runs plugins at init(). The plugin
    // body is a STATEMENT block returning void: P5's plugin-init contract
    // rejects a returned value that is neither void nor a cleanup function,
    // and an expression-bodied `() => (installed = true)` returns `true`.
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

    expect(keysFor(createI18nFromCore(attachPlugins(attachLoader(baseHost()))))).toEqual(
      keysFor(createI18nFromCore(baseHost())),
    );
  });
});
