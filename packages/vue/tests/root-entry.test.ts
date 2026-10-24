/**
 * Pins WHAT the single `@comvi/vue` entry publishes; composable behaviour on a
 * base host lives in tests/base-host.test.ts and the js-contract suites.
 *
 * `createI18n` here is vue's own factory, because vue has a `VueI18n` to
 * construct and `ssrLocale` must reach the core before the reactive ref is
 * seeded. A host built elsewhere comes from `createI18n` in `@comvi/core`
 * directly — there is no `createCore` alias — and `I18n` is a type here.
 *
 * The absence claims — the `<T>` chunk staying out of a graph that never
 * renders it, unused capability subpaths pruning — cannot be made from source,
 * where every module loads eagerly; they live in the bundler-matrix cases and
 * the size rows. Core's BASE root is deliberately not one of them: the preset
 * constructs on it, so it is in the graph by design.
 */
import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n as coreCreateI18n, I18n as CoreI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import * as core from "@comvi/core";
import * as root from "../src/index";
import { VueI18n } from "../src/VueI18n";
import { I18N_INJECTION_KEY as DeepInjectionKey } from "../src/keys";

describe("@comvi/vue — the single root entry", () => {
  it("builds a working wrapper from one import, with no @comvi/core specifier", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello, {name}!" } },
    });

    expect(i18n).toBeInstanceOf(VueI18n);
    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.locale.value).toBe("en");
  });

  it("wraps a BASE host — the capabilities are absent on the core AND the wrapper", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    // The claim is that these members are ABSENT, so the two reads go through a
    // view that admits them — the base host's own type does not declare them.
    const bareCore = i18n.core as Partial<root.I18nLoaderApi & root.I18nPluginApi>;
    expect(bareCore.reloadMessages).toBeUndefined();
    expect(bareCore.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n.core).toBe(false);
    expect("instanceId" in i18n.core).toBe(false);
    // The eight dropped proxies stay dropped on the preset path too.
    expect("reloadMessages" in i18n).toBe(false);
    expect("registerPlugin" in i18n).toBe(false);
  });

  it("applies ssrLocale to the host before seeding the reactive ref", () => {
    const i18n = root.createI18n({
      locale: "en",
      ssrLocale: "fr",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello!" }, fr: { greeting: "Bonjour !" } },
    });

    expect(i18n.core.locale).toBe("fr");
    expect(i18n.locale.value).toBe("fr");
    expect(i18n.t("greeting" as never)).toBe("Bonjour !");
  });

  it("installs as a Vue plugin and drives useI18n()", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello, {name}!" } },
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

  it("builds the preset on core's own class, and publishes neither `createCore` nor `I18n` as values", () => {
    expect(root.createI18n({ locale: "en", exposeGlobal: false }).core).toBeInstanceOf(CoreI18n);
    // The escape-hatch host is built with `createI18n` from `@comvi/core`
    // directly; `I18n` is a TYPE from this root.
    expect("createCore" in root).toBe(false);
    expect("I18n" in root).toBe(false);
  });
});

describe("@comvi/vue — ICU, one shape, one specifier", () => {
  it("takes the COMPILER in the preset call for an inline catalog", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: root.icuCompiler,
      messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("takes the same COMPILER option on a host built with core's createI18n", () => {
    // One enable form for every catalog source: the option is read in the
    // constructor, so a catalog that arrives later compiles under ICU with
    // nothing composed.
    const core = coreCreateI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: root.icuCompiler,
    });
    const i18n = root.createI18nFromCore(core);

    core.addMessages({ en: { items: "{count, plural, one {# item} other {# items}}" } });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("publishes no `icu` installer beside the compiler", () => {
    expect(Object.keys(root)).not.toContain("icu");
    expect((root as Record<string, unknown>).icu).toBeUndefined();
  });
});

describe("@comvi/vue — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(root.icuCompiler).toBe(icuCompiler);
    expect(root.attachLoader).toBe(attachLoader);
    // `flattenCatalog` is NOT re-exported: nested catalogs are base behaviour (C1).
    expect(root).not.toHaveProperty("flattenCatalog");
    // `attachPlugins`/`attachDevtools` are NOT re-exported here: they stay on
    // `@comvi/core/plugins` and `@comvi/core/devtools` for advanced use (P4).
    expect(root).not.toHaveProperty("attachPlugins");
    expect(root).not.toHaveProperty("attachDevtools");
    // The installers are core's own factories, one hop, same rule.
    expect(root.loader).toBe(loader);
    expect(root.plugins).toBe(plugins);
    expect(root.devtools).toBe(devtools);
  });

  it("a core host composes through createI18nFromCore, preserving the host", () => {
    const core = root.attachLoader(coreCreateI18n({ locale: "en", exposeGlobal: false }));
    const i18n = root.createI18nFromCore(core);

    expect(i18n.core).toBe(core);
    expect(typeof i18n.core.reloadMessages).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.core.getLoader()).toBeUndefined();
  });

  it("composes AND configures in one expression — the documented recipe", async () => {
    const core = coreCreateI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: root.icuCompiler,
    }).use(
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

    await core.setLocale("uk");
    expect(i18n.t("greeting" as never)).toBe("Привіт");
  });

  it("the one-call preset's own host takes the pipe too", () => {
    const i18n = root.createI18n({ locale: "en", ssrLocale: "en", exposeGlobal: false });

    const composed = i18n.core.use(root.plugins());
    expect(composed).toBe(i18n.core);
    expect(typeof composed.use).toBe("function");
  });

  it("acquires the composed capability through the composable", () => {
    const i18n = root.createI18nFromCore(
      root.attachLoader(coreCreateI18n({ locale: "en", exposeGlobal: false })),
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

    expect(typeof bag?.reloadMessages).toBe("function");
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
  // The whole published runtime surface, exact: a new name has to be added
  // here on purpose, an accidental one fails the suite.
  const SURFACE = [
    "I18N_INJECTION_KEY",
    "T",
    "VueI18n",
    "attachLoader",
    "createI18n",
    "createI18nFromCore",
    "definePlugin",
    "devtools",
    "formatCurrency",
    "formatDate",
    "formatNumber",
    "formatRelativeTime",
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
    // subpath registers tag syntax ambiently, so naming any of them here would
    // put the side effect in every vue graph.
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
      messages: { en: { msg: "a <b>c</b> d" } },
    });

    expect(i18n.t("msg" as never)).toBe("a <b>c</b> d");
  });
});

describe("@comvi/vue — one entry, one injection key", () => {
  it("shares a single injection key between the root entry and the module behind it", () => {
    // One chunk graph means one `Symbol("i18n")`. Two entries would make a
    // second copy, and a plugin installed from one could not be seen by a
    // composable from the other.
    expect(root.I18N_INJECTION_KEY).toBe(DeepInjectionKey);

    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello" } },
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

describe("@comvi/vue — the standalone formatters", () => {
  // Derived from core, so a formatter core adds cannot be left off this entry.
  const CORE_FORMATTERS = Object.keys(core)
    .filter((name) => /^format[A-Z]/.test(name))
    .sort();

  it("re-exports exactly core's formatter set, as core's own bindings", () => {
    expect(CORE_FORMATTERS.length).toBeGreaterThan(0);
    expect(
      Object.keys(root)
        .filter((name) => /^format[A-Z]/.test(name))
        .sort(),
    ).toEqual(CORE_FORMATTERS);
    for (const name of CORE_FORMATTERS) {
      expect((root as Record<string, unknown>)[name]).toBe((core as Record<string, unknown>)[name]);
    }
  });
});
