/**
 * framework-slim DX pass — the `@comvi/vue/slim` SINGLE-PACKAGE surface.
 *
 * Vue is the one wrapper whose preset is a real function: there is a `VueI18n`
 * to construct around the host, so `createI18n` here mirrors `@comvi/vue`'s
 * root factory (`ssrLocale` handling included) with a `@comvi/core` core.
 * `createCore` + `createI18nFromCore` remain the custom-host path, and both
 * now come from the same specifier — that is the whole DX claim.
 *
 * Behaviour of the composables on a slim host is already covered by
 * tests/slim-host.test.ts and the js-contract suites; this file pins the
 * surface itself.
 *
 * The absence claims that need a real bundler — the tag chunks staying out of
 * the graph, and the three unused capability subpaths pruning in webpack AND
 * vite, development AND production — live in scripts/bundler-matrix (case
 * `vue-slim-preset`) and in the `fw-vue-slim-preset` size fixture. They cannot
 * be made from source, where every module is loaded eagerly. The base
 * `@comvi/core` root is NOT among those absences: `src/slim.ts` re-exports its
 * constructor as `createCore`, so it is in the graph by design.
 */
import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import * as slim from "../src/slim";
import { VueI18n } from "../src/VueI18n";

describe("@comvi/vue/slim — the one-call preset", () => {
  it("builds a working wrapper from one import, with no @comvi/core specifier", () => {
    const i18n = slim.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(i18n).toBeInstanceOf(VueI18n);
    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.locale.value).toBe("en");
  });

  it("wraps a BARE host — the capabilities are absent on the core AND the wrapper", () => {
    const i18n = slim.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n.core.reloadTranslations).toBeUndefined();
    expect(i18n.core.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n.core).toBe(false);
    expect("instanceId" in i18n.core).toBe(false);
    // The eight dropped proxies stay dropped on the preset path too.
    expect("reloadTranslations" in i18n).toBe(false);
    expect("use" in i18n).toBe(false);
  });

  it("applies ssrLocale to the host before seeding the reactive ref", () => {
    const i18n = slim.createI18n({
      locale: "en",
      ssrLocale: "fr",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello!" }, fr: { greeting: "Bonjour !" } },
    });

    expect(i18n.core.locale).toBe("fr");
    expect(i18n.locale.value).toBe("fr");
    expect(i18n.t("greeting" as never)).toBe("Bonjour !");
  });

  it("installs as a Vue plugin and drives useI18n()", () => {
    const i18n = slim.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          const { t, locale } = slim.useI18n();
          return () => h("div", `${locale.value}:${t("greeting", { name: "Ada" })}`);
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(wrapper.text()).toBe("en:Hello, Ada!");
  });

  it("injects ICU through the re-exported compiler — still one package", () => {
    const i18n = slim.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: slim.icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });
});

describe("@comvi/vue/slim — the custom-host path, same package", () => {
  it("createCore is core's own constructor and composes through createI18nFromCore", () => {
    const core = slim.attachLoader(slim.createCore({ locale: "en", exposeGlobal: false }));
    const i18n = slim.createI18nFromCore(core);

    expect(i18n.core).toBe(core);
    expect(typeof i18n.core.reloadTranslations).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.core.getLoader()).toBeUndefined();
  });

  it("composes AND configures in one expression — the documented recipe", async () => {
    // The target DX, verbatim from the README: host, capability and import
    // map in a single expression, all from `@comvi/vue/slim`.
    const core = slim
      .createCore({ locale: "en", exposeGlobal: false, compiler: slim.icuCompiler })
      .with(
        slim.loader({
          en: async () => ({ default: { greeting: "Hello" } }),
          uk: async () => ({ default: { greeting: "Привіт" } }),
        }),
      );
    const i18n = slim.createI18nFromCore(core);

    expect(i18n.core).toBe(core);
    // Unlike bare `attachLoader`, this one is CONFIGURED.
    expect(typeof core.getLoader()).toBe("function");

    await core.init();
    expect(i18n.t("greeting" as never)).toBe("Hello");

    await core.setLocaleAsync("uk");
    expect(i18n.t("greeting" as never)).toBe("Привіт");
  });

  it("the one-call preset's own host takes the pipe too", () => {
    const i18n = slim.createI18n({ locale: "en", ssrLocale: "en", exposeGlobal: false });

    expect(i18n.core.with(slim.plugins())).toBe(i18n.core);
    expect(typeof i18n.core.use).toBe("function");
  });

  it("acquires the composed capability through the composable", () => {
    const i18n = slim.createI18nFromCore(
      slim.attachLoader(slim.createCore({ locale: "en", exposeGlobal: false })),
    );
    let bag: slim.UseI18nLoaderReturn | undefined;

    mount(
      defineComponent({
        setup() {
          bag = slim.useI18nLoader();
          return () => h("div");
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(typeof bag?.reloadTranslations).toBe("function");
    expect(typeof bag?.addActiveNamespace).toBe("function");
  });

  it("throws at the composable when the preset host has no capability", () => {
    const i18n = slim.createI18n({ locale: "en", exposeGlobal: false });

    expect(() =>
      mount(
        defineComponent({
          setup() {
            slim.useI18nPlugins();
            return () => h("div");
          },
        }),
        { global: { plugins: [i18n] } },
      ),
    ).toThrow(/no plugins capability/);
  });
});

describe("@comvi/vue/slim — the export surface", () => {
  // `@comvi/vue`'s index carries `export * from "@comvi/core"`, so its runtime
  // key set is core's whole root surface plus vue's. Comparing against it
  // would compare against the very thing this entry exists to exclude, so the
  // vue bindings are listed explicitly instead.
  const VUE_BINDINGS = [
    "I18N_INJECTION_KEY",
    "T",
    "VueI18n",
    "createI18n",
    "createI18nFromCore",
    "useI18n",
    "useI18nLoader",
    "useI18nPlugins",
  ];
  const TOOLKIT = [
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createCore",
    "devtools",
    "flattenCatalog",
    "icuCompiler",
    "loader",
    "plugins",
  ];

  it("exports exactly vue's bindings plus the capability toolkit", () => {
    expect(Object.keys(slim).sort()).toEqual([...VUE_BINDINGS, ...TOOLKIT].sort());
  });

  it("re-exports core's own bindings, not copies", () => {
    expect(slim.icuCompiler).toBe(icuCompiler);
    expect(slim.attachLoader).toBe(attachLoader);
    expect(slim.flattenCatalog).toBe(flattenCatalog);
    expect(slim.attachPlugins).toBe(attachPlugins);
    expect(slim.attachDevtools).toBe(attachDevtools);
    // The DX-2 installers are core's own factories, one hop, same rule.
    expect(slim.loader).toBe(loader);
    expect(slim.plugins).toBe(plugins);
    expect(slim.devtools).toBe(devtools);
  });

  it("never re-exports the root class or the side-effectful tags toolbox", () => {
    // `I18n` is core's base class, which `@comvi/vue`'s `export *` carries and
    // this entry leaves off on purpose: the slim surface publishes `createI18n`
    // and `createCore` as its construction exports. `registerTagSyntax` /
    // `prepareTranslation` come from `@comvi/core/tags`, whose import registers
    // tag syntax ambiently, so either of THOSE would put a side effect in every
    // slim graph.
    expect(slim).not.toHaveProperty("I18n");
    expect(slim).not.toHaveProperty("registerTagSyntax");
    expect(slim).not.toHaveProperty("tagSyntaxExtension");
    expect(slim).not.toHaveProperty("prepareTranslation");
  });
});
