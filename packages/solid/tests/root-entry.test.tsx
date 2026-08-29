/**
 * Pins WHAT the single `@comvi/solid` entry publishes; accessor behaviour on a
 * base host lives in tests/base-host.test.tsx and the js-contract suites.
 *
 * The absence claims — the `<T>` chunk staying out of a graph that never
 * renders it, unused capability subpaths pruning — cannot be made from source,
 * where every module loads eagerly; they live in the bundler-matrix cases and
 * the size rows. Ambient tag registration especially cannot be observed here:
 * vitest shares ONE native module registry per worker, so any sibling file
 * that ever touched `@comvi/core/tags` would decide the answer. What is
 * checkable from source — that no name from that subpath is re-exported — is
 * pinned below. Core's BASE root is deliberately not one of these absences:
 * this entry re-exports `createI18n` and `I18n`, so it is in the graph by
 * design.
 */
import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { createI18n as coreCreateI18n, I18n as CoreI18n } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icu, icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import { I18nProvider as DeepI18nProvider } from "../src/context";
import * as root from "../src/index";

function underProvider<R>(i18n: WrapperI18nHost, use: () => R) {
  let api!: R;
  const container = document.createElement("div");
  const dispose = render(
    () => (
      <root.I18nProvider i18n={i18n} autoInit={false}>
        {
          (() => {
            const Probe = () => {
              api = use();
              return <div />;
            };
            return <Probe />;
          })() as never
        }
      </root.I18nProvider>
    ),
    container,
  );
  dispose();
  return api;
}

describe("@comvi/solid — the single root entry", () => {
  it("builds a working host from one import, with no @comvi/core specifier", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.locale).toBe("en");
  });

  it("builds a BASE host — the capabilities are absent, not disabled", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n.reloadTranslations).toBeUndefined();
    expect(i18n.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n).toBe(false);
    expect("instanceId" in i18n).toBe(false);
  });

  it("publishes the factory and the class it constructs as one pair", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n).toBeInstanceOf(root.I18n);
    expect(new root.I18n({ locale: "en", exposeGlobal: false })).toBeInstanceOf(root.I18n);
  });
});

describe("@comvi/solid — ICU, both shapes, one specifier", () => {
  it("takes the COMPILER in the constructor call for an inline catalog", () => {
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
    // seen a catalog yet, so a later loader merge is compiled by ICU.
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false }).with(root.icu());

    i18n.addTranslations({ en: { items: "{count, plural, one {# item} other {# items}}" } });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("repeats the ICU installer idempotently before ingestion", () => {
    const i18n = root
      .createI18n({ locale: "en", exposeGlobal: false })
      .with(root.icu())
      .with(root.icu());

    i18n.addTranslations({ en: { items: "{count, plural, one {# item} other {# items}}" } });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe("2 items");
  });

  it("refuses the installer AFTER ingestion, and mutates nothing on the way out", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });

    let code: unknown;
    try {
      i18n.with(root.icu());
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) code = error.code;
    }

    expect(code).toBe("E_COMPILER_LOCKED");
    expect(i18n.t("greeting" as never)).toBe("Hello");
  });
});

describe("@comvi/solid — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(root.createI18n).toBe(coreCreateI18n);
    expect(root.I18n).toBe(CoreI18n);
    expect(root.icu).toBe(icu);
    expect(root.icuCompiler).toBe(icuCompiler);
    expect(root.attachLoader).toBe(attachLoader);
    expect(root.flattenCatalog).toBe(flattenCatalog);
    expect(root.attachPlugins).toBe(attachPlugins);
    expect(root.attachDevtools).toBe(attachDevtools);
    // The installers are core's own factories, one hop, same rule.
    expect(root.loader).toBe(loader);
    expect(root.plugins).toBe(plugins);
    expect(root.devtools).toBe(devtools);
  });

  it("composes a capability the base host did not have, acquirable through the accessor", () => {
    const i18n = root.attachLoader(root.createI18n({ locale: "en", exposeGlobal: false }));

    const bag = underProvider(i18n, () => root.useI18nLoader());

    expect(typeof bag.reloadTranslations).toBe("function");
    expect(typeof bag.addActiveNamespace).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("composes AND configures in one expression — the documented recipe", async () => {
    const i18n = root
      .createI18n({ locale: "en", exposeGlobal: false })
      .with(root.icu())
      .with(
        root.loader({
          en: async () => ({
            default: { items: "{count, plural, one {# item} other {# items}}" },
          }),
          uk: async () => ({
            default: { items: "{count, plural, one {# item} other {# items}}" },
          }),
        }),
      );

    const bag = underProvider(i18n, () => root.useI18nLoader());
    expect(typeof bag.reloadTranslations).toBe("function");
    // Unlike bare `attachLoader`, this one is CONFIGURED.
    expect(typeof i18n.getLoader()).toBe("function");

    await i18n.init();
    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");

    await i18n.setLocaleAsync("uk");
    expect(i18n.t("items" as never, { count: 3 } as never)).toBe("3 items");
  });

  it("attaching one capability does not smuggle in the other", () => {
    const i18n = root.attachLoader(root.createI18n({ locale: "en", exposeGlobal: false }));

    expect(() => underProvider(i18n, () => root.useI18nPlugins())).toThrow(/no plugins capability/);
  });
});

describe("@comvi/solid — the export surface", () => {
  // The whole published runtime surface, exact. A new name has to be added
  // here on purpose; an accidental one fails the suite.
  const SURFACE = [
    "I18n",
    "I18nProvider",
    "T",
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createCacheRevisionSignal",
    "createDefaultNamespaceSignal",
    "createI18n",
    "createInitializedSignal",
    "createInitializingSignal",
    "createLoadingSignal",
    "createLocaleSignal",
    "devtools",
    "flattenCatalog",
    "icu",
    "icuCompiler",
    "loader",
    "plugins",
    "useI18n",
    "useI18nContext",
    "useI18nLoader",
    "useI18nPlugins",
  ];

  it("publishes exactly the documented named surface — nothing more", () => {
    expect(Object.keys(root).sort()).toEqual(SURFACE);
  });

  it("never re-exports the side-effectful tags toolbox", () => {
    // Every name below is a real `@comvi/core/tags` export, and importing that
    // subpath registers tag syntax ambiently, so naming any of them here would
    // put the side effect in every solid graph. (The module-graph half of that
    // proof lives in the size-row sentinels and the bundler-matrix cases.)
    expect(root).not.toHaveProperty("registerTagSyntax");
    expect(root).not.toHaveProperty("tagSyntaxExtension");
    expect(root).not.toHaveProperty("prepareTranslation");
    expect(root).not.toHaveProperty("createElement");
    expect(root).not.toHaveProperty("createFragment");
  });
});

describe("@comvi/solid — one entry, one solid context", () => {
  it("shares a single context between the root entry and the module behind it", () => {
    // One chunk graph means one `createContext()` call. Two entries would make
    // a second copy, and a provider from one could not be seen by a hook from
    // the other.
    expect(root.I18nProvider).toBe(DeepI18nProvider);

    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });

    let text: string | undefined;
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <DeepI18nProvider i18n={i18n} autoInit={false}>
          {
            (() => {
              const Probe = () => {
                text = root.useI18n().t("greeting" as never);
                return <div />;
              };
              return <Probe />;
            })() as never
          }
        </DeepI18nProvider>
      ),
      container,
    );
    dispose();

    expect(text).toBe("Hello");
  });
});
