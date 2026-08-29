/**
 * The `@comvi/vue` SINGLE-ENTRY surface.
 *
 * One package specifier is the whole app-facing story: the three construction
 * paths, the vue bindings and the capability toolkit all come from
 * `../src/index`, and there is no second entry to import them from. This file
 * pins the surface itself; composable behaviour on a base host lives in
 * tests/base-host.test.ts and the js-contract suites.
 *
 * Vue is the one wrapper whose preset is a REAL function — there is a `VueI18n`
 * to construct around the host, and `ssrLocale` has to reach the core before
 * the reactive ref is seeded — so `createI18n` here is vue's own factory while
 * `createCore` is core's constructor under a name of its own. Both, plus
 * `createI18nFromCore`, now ship from the same specifier.
 *
 * The absence claims that need a real bundler — the `<T>` chunk staying out of
 * a graph that never renders it, and the unused capability subpaths pruning in
 * webpack AND vite, development AND production — live in the bundler-matrix
 * cases `vue-default` / `vue-icu` / `vue-composed` and in the `fw-vue-default`,
 * `fw-vue-default-composed`, `fw-vue-default-t`, `fw-vue-icu` and
 * `fw-vue-full-composite` size rows. They cannot be made from source, where
 * every module is loaded eagerly. Core's BASE root is deliberately not among
 * those absences: `src/index.ts` re-exports its `createI18n` as `createCore`
 * and its `I18n` class by name, so it is in the graph by design.
 */
import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n as coreCreateI18n, I18n as CoreI18n } from "@comvi/core";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icu, icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import * as root from "../src/index";
import { VueI18n } from "../src/VueI18n";
import { I18N_INJECTION_KEY as DeepInjectionKey } from "../src/keys";

describe("@comvi/vue — the single root entry", () => {
  it("builds a working wrapper from one import, with no @comvi/core specifier", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(i18n).toBeInstanceOf(VueI18n);
    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.locale.value).toBe("en");
  });

  it("wraps a BASE host — the capabilities are absent on the core AND the wrapper", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n.core.reloadTranslations).toBeUndefined();
    expect(i18n.core.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n.core).toBe(false);
    expect("instanceId" in i18n.core).toBe(false);
    // The eight dropped proxies stay dropped on the preset path too.
    expect("reloadTranslations" in i18n).toBe(false);
    expect("use" in i18n).toBe(false);
  });

  it("applies ssrLocale to the host before seeding the reactive ref", () => {
    const i18n = root.createI18n({
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
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          const { t, locale } = root.useI18n();
          return () => h("div", `${locale.value}:${t("greeting", { name: "Ada" })}`);
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(wrapper.text()).toBe("en:Hello, Ada!");
  });

  it("publishes core's own base constructor and class beside the preset", () => {
    // `createI18n` is vue's; `createCore` and `I18n` are core's, by name. The
    // preset builds on exactly that class, so the two halves cannot drift.
    const core = root.createCore({ locale: "en", exposeGlobal: false });

    expect(core).toBeInstanceOf(root.I18n);
    expect(root.createI18n({ locale: "en", exposeGlobal: false }).core).toBeInstanceOf(root.I18n);
    expect(new root.I18n({ locale: "en", exposeGlobal: false })).toBeInstanceOf(root.I18n);
  });
});

describe("@comvi/vue — ICU, both shapes, one specifier", () => {
  it("takes the COMPILER in the preset call for an inline catalog", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: root.icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("takes the INSTALLER before ingestion for a remote catalog", () => {
    // The remote-catalog recipe: `.with(icu())` runs on a host that has not
    // seen a catalog yet, so the merge a loader performs later is compiled by
    // the ICU compiler. On vue the pipe goes on the CORE, which is what
    // `createCore` hands you.
    const core = root.createCore({ locale: "en", exposeGlobal: false }).with(root.icu());
    const i18n = root.createI18nFromCore(core);

    core.addTranslations({ en: { items: "{count, plural, one {# item} other {# items}}" } });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("repeats the ICU installer idempotently before ingestion", () => {
    const core = root
      .createCore({ locale: "en", exposeGlobal: false })
      .with(root.icu())
      .with(root.icu());

    core.addTranslations({ en: { items: "{count, plural, one {# item} other {# items}}" } });

    expect(root.createI18nFromCore(core).t("items" as never, { count: 2 } as never)).toBe(
      "2 items",
    );
  });

  it("refuses the installer AFTER ingestion, and mutates nothing on the way out", () => {
    // The preset ingests its `translation` at construction, so its host is
    // already locked — which is exactly why an inline catalog takes the
    // compiler option instead.
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });

    let code: unknown;
    try {
      i18n.core.with(root.icu());
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) code = error.code;
    }

    expect(code).toBe("E_COMPILER_LOCKED");
    expect(i18n.t("greeting" as never)).toBe("Hello");
  });
});

describe("@comvi/vue — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(root.createCore).toBe(coreCreateI18n);
    expect(root.I18n).toBe(CoreI18n);
    expect(root.icu).toBe(icu);
    expect(root.icuCompiler).toBe(icuCompiler);
    expect(root.attachLoader).toBe(attachLoader);
    expect(root.flattenCatalog).toBe(flattenCatalog);
    expect(root.attachPlugins).toBe(attachPlugins);
    expect(root.attachDevtools).toBe(attachDevtools);
    // The DX-2 installers are core's own factories, one hop, same rule.
    expect(root.loader).toBe(loader);
    expect(root.plugins).toBe(plugins);
    expect(root.devtools).toBe(devtools);
  });

  it("createCore composes through createI18nFromCore, preserving the host", () => {
    const core = root.attachLoader(root.createCore({ locale: "en", exposeGlobal: false }));
    const i18n = root.createI18nFromCore(core);

    expect(i18n.core).toBe(core);
    expect(typeof i18n.core.reloadTranslations).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.core.getLoader()).toBeUndefined();
  });

  it("composes AND configures in one expression — the documented recipe", async () => {
    // The target DX, verbatim from the README: host, capability and import
    // map in a single expression, all from `@comvi/vue`.
    const core = root
      .createCore({ locale: "en", exposeGlobal: false, compiler: root.icuCompiler })
      .with(
        root.loader({
          en: async () => ({ default: { greeting: "Hello" } }),
          uk: async () => ({ default: { greeting: "Привіт" } }),
        }),
      );
    const i18n = root.createI18nFromCore(core);

    expect(i18n.core).toBe(core);
    // Unlike bare `attachLoader`, this one is CONFIGURED.
    expect(typeof core.getLoader()).toBe("function");

    await core.init();
    expect(i18n.t("greeting" as never)).toBe("Hello");

    await core.setLocaleAsync("uk");
    expect(i18n.t("greeting" as never)).toBe("Привіт");
  });

  it("the one-call preset's own host takes the pipe too", () => {
    const i18n = root.createI18n({ locale: "en", ssrLocale: "en", exposeGlobal: false });

    expect(i18n.core.with(root.plugins())).toBe(i18n.core);
    expect(typeof i18n.core.use).toBe("function");
  });

  it("acquires the composed capability through the composable", () => {
    const i18n = root.createI18nFromCore(
      root.attachLoader(root.createCore({ locale: "en", exposeGlobal: false })),
    );
    let bag: root.UseI18nLoaderReturn | undefined;

    mount(
      defineComponent({
        setup() {
          bag = root.useI18nLoader();
          return () => h("div");
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(typeof bag?.reloadTranslations).toBe("function");
    expect(typeof bag?.addActiveNamespace).toBe("function");
  });

  it("throws at the composable when the preset host has no capability", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    expect(() =>
      mount(
        defineComponent({
          setup() {
            root.useI18nPlugins();
            return () => h("div");
          },
        }),
        { global: { plugins: [i18n] } },
      ),
    ).toThrow(/no plugins capability/);
  });
});

describe("@comvi/vue — the export surface", () => {
  // The whole published runtime surface, exact. A new name has to be added
  // here on purpose; an accidental one fails the suite. Before the convergence
  // this entry carried `export * from "@comvi/core"`, so its key set was core's
  // whole root surface plus vue's and no list like this was possible.
  const SURFACE = [
    "I18N_INJECTION_KEY",
    "I18n",
    "T",
    "VueI18n",
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createCore",
    "createI18n",
    "createI18nFromCore",
    "devtools",
    "flattenCatalog",
    "icu",
    "icuCompiler",
    "loader",
    "plugins",
    "useI18n",
    "useI18nLoader",
    "useI18nPlugins",
  ];

  it("publishes exactly the documented named surface — nothing more", () => {
    expect(Object.keys(root).sort()).toEqual(SURFACE);
  });

  it("never re-exports the side-effectful tags toolbox", () => {
    // Every name below is a real `@comvi/core/tags` export, and importing that
    // subpath registers tag syntax ambiently. Naming any of them here would put
    // the side effect in every vue graph. No module in this package imports
    // that subpath at all — `<T>` takes the pure `@comvi/core/rich-text` seam.
    expect(root).not.toHaveProperty("registerTagSyntax");
    expect(root).not.toHaveProperty("tagSyntaxExtension");
    expect(root).not.toHaveProperty("prepareTranslation");
    expect(root).not.toHaveProperty("createElement");
    expect(root).not.toHaveProperty("createFragment");
  });

  it("leaves string-API tag markup literal — the documented residual", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { msg: "a <b>c</b> d" } },
    });

    expect(i18n.t("msg" as never)).toBe("a <b>c</b> d");
  });
});

describe("@comvi/vue — one entry, one injection key", () => {
  it("shares a single injection key between the root entry and the module behind it", () => {
    // One chunk graph means one `Symbol("i18n")`. A second entry used to make a
    // second copy, and a plugin installed from one could not be seen by a
    // composable from the other. Same binding, and a wrapper installed as a
    // plugin still feeds a `useI18n()` taken from the root.
    expect(root.I18N_INJECTION_KEY).toBe(DeepInjectionKey);

    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          const { t } = root.useI18n();
          return () => h("div", t("greeting"));
        },
      }),
      { global: { plugins: [i18n] } },
    );

    expect(wrapper.text()).toBe("Hello");
  });
});
