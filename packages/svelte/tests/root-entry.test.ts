/**
 * Pins WHAT the single `@comvi/svelte` entry publishes; binding behaviour on a
 * base host lives in tests/base-host.test.ts and the js-contract suites.
 *
 * The absence claims — `dist/T.svelte` staying out of a graph that never
 * renders it, unused capability subpaths pruning — cannot be made from source,
 * where every module loads eagerly; they live in the bundler-matrix cases and
 * the size rows. The one absence that IS observable without a bundler — no
 * module here naming `@comvi/core/tags`, so importing the built root never
 * registers tag syntax — is pinned against the BUILT artifacts in
 * tests/exports-smoke.test.ts. Core's BASE root is deliberately not one of
 * them: this entry re-exports `createI18n` and `I18n`, so it is in the graph
 * by design.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import { createI18n as coreCreateI18n, I18n as CoreI18n } from "@comvi/core";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icu, icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import type { I18nLoaderApi } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import type { I18nPluginHostApi } from "@comvi/core/plugins";
// The `.js` extension the entry itself uses, so the identity assertions below
// compare the SAME resolved module rather than two spellings of one path.
import {
  getI18nContext as deepGetI18nContext,
  setI18nContext as deepSetI18nContext,
} from "../src/context.js";
import { useI18n as deepUseI18n } from "../src/useI18n.js";
import DeepT from "../src/T.svelte";
import * as root from "../src/index";
import type { UseI18nLoaderReturn } from "../src/index";
import RootEntryHarness from "./RootEntryHarness.test.svelte";
import ContextHarness from "./ContextHarness.test.svelte";

describe("@comvi/svelte — the single root entry", () => {
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
    // A base host does not DECLARE the capability members, so the absence
    // claim needs a view that admits them as optional to be readable at all.
    const bare = i18n as Partial<I18nLoaderApi & I18nPluginHostApi>;

    expect(bare.reloadTranslations).toBeUndefined();
    expect(bare.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n).toBe(false);
    expect("instanceId" in i18n).toBe(false);
  });

  it("publishes the factory and the class it constructs as one pair", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n).toBeInstanceOf(root.I18n);
    expect(new root.I18n({ locale: "en", exposeGlobal: false })).toBeInstanceOf(root.I18n);
  });
});

describe("@comvi/svelte — ICU, both shapes, one specifier", () => {
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

    expect(() => i18n.with(root.icu())).toThrow(
      expect.objectContaining({ code: "E_COMPILER_LOCKED" }),
    );
    expect(i18n.t("greeting" as never)).toBe("Hello");
  });
});

describe("@comvi/svelte — the capability toolkit", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
  });

  afterEach(() => {
    if (component) unmount(component);
    target.remove();
  });

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

  it("composes a capability the base host did not have, acquirable through the reader", () => {
    const i18n = root.attachLoader(
      root.createI18n({
        locale: "en",
        exposeGlobal: false,
        translation: { en: { greeting: "Hello, {name}!" } },
      }),
    );
    let bag: UseI18nLoaderReturn | undefined;

    component = mount(RootEntryHarness, {
      target,
      props: { i18n, report: (b: UseI18nLoaderReturn) => (bag = b) },
    });

    expect(target.querySelector('[data-testid="greeting"]')?.textContent).toBe("Hello, Ada!");
    expect(typeof bag?.reloadTranslations).toBe("function");
    expect(typeof bag?.addActiveNamespace).toBe("function");
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
            default: {
              greeting: "Hello, {name}!",
              items: "{count, plural, one {# item} other {# items}}",
            },
          }),
          uk: async () => ({
            default: {
              greeting: "Привіт, {name}!",
              items: "{count, plural, one {# item} other {# items}}",
            },
          }),
        }),
      );

    let bag: UseI18nLoaderReturn | undefined;
    component = mount(RootEntryHarness, {
      target,
      props: { i18n, report: (b: UseI18nLoaderReturn) => (bag = b) },
    });

    expect(typeof bag?.reloadTranslations).toBe("function");
    // Unlike bare `attachLoader`, this one is CONFIGURED.
    expect(typeof i18n.getLoader()).toBe("function");

    await i18n.init();
    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");

    await i18n.setLocaleAsync("uk");
    expect(i18n.t("items" as never, { count: 3 } as never)).toBe("3 items");
  });

  it("throws at the reader when the root-built host has no capability at all", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(() => mount(RootEntryHarness, { target, props: { i18n } })).toThrow(
      /no loader capability/,
    );
  });

  it("attaching one capability does not smuggle in the other", () => {
    const i18n = root.attachLoader(root.createI18n({ locale: "en", exposeGlobal: false }));

    expect(typeof i18n.reloadTranslations).toBe("function");
    // The plugin capability was never composed on, so its members are not
    // declared either — same optional view as the base-host probe above.
    expect((i18n as Partial<I18nPluginHostApi>).onMissingKey).toBeUndefined();
  });
});

describe("@comvi/svelte — the export surface", () => {
  // The whole published runtime surface, exact. A new name has to be added
  // here on purpose; an accidental one fails the suite.
  const SURFACE = [
    "I18n",
    "T",
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createCacheRevisionStore",
    "createDefaultParamsStore",
    "createI18n",
    "createInitializedStore",
    "createInitializingStore",
    "createLoadingStore",
    "createLocaleStore",
    "devtools",
    "flattenCatalog",
    "getI18nContext",
    "icu",
    "icuCompiler",
    "loader",
    "plugins",
    "setI18nContext",
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
    // put the side effect in every svelte graph. (The built-artifact half of
    // that proof lives in tests/exports-smoke.test.ts.)
    expect(root).not.toHaveProperty("registerTagSyntax");
    expect(root).not.toHaveProperty("tagSyntaxExtension");
    expect(root).not.toHaveProperty("prepareTranslation");
    expect(root).not.toHaveProperty("createElement");
    expect(root).not.toHaveProperty("createFragment");
  });
});

describe("@comvi/svelte — one entry, one context key", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
  });

  afterEach(() => {
    if (component) unmount(component);
    target.remove();
  });

  it("re-exports the binding modules themselves — one context key by identity", () => {
    // `svelte-package` preserves modules, so the root and the modules behind
    // it are the same objects and the react/solid/vue "two entries, two
    // contexts" hazard never existed here. What must still hold is that the
    // root re-exports the bindings THEMSELVES rather than wrapping them: a
    // wrapper would mint a second `getContext` key and introduce that hazard.
    expect(root.setI18nContext).toBe(deepSetI18nContext);
    expect(root.getI18nContext).toBe(deepGetI18nContext);
    expect(root.useI18n).toBe(deepUseI18n);
    expect(root.T).toBe(DeepT);
  });

  it("reads a context set through the deep module with the root's bindings", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { hello: "Hello" } },
    });

    // ContextHarness sets the context through `../src/context` and reads it
    // through `../src/useI18n` and `../src/T.svelte` — the three modules the
    // assertion above pins to the root's names.
    component = mount(ContextHarness, { target, props: { i18n, autoInit: false } });

    expect(target.querySelector('[data-testid="hook"]')?.textContent).toBe("Hello-en");
    expect(target.querySelector('[data-testid="component"]')?.textContent).toContain("Hello");
  });
});
