/**
 * framework-slim DX pass — the `@comvi/svelte/slim` SINGLE-PACKAGE surface.
 *
 * What is new here is the ENTRY, not the bindings: a one-call `createI18n`
 * built on core-slim, plus named re-exports of the capability toolkit so an
 * app never has to name `@comvi/core`. Behaviour of the readers on a slim host
 * is already covered by tests/slim-host.test.ts and the js-contract suites;
 * this file pins the surface itself.
 *
 * The absence claims that need a real bundler — the tag chunks staying out of
 * the graph, and the three unused capability subpaths pruning in webpack AND
 * vite, development AND production — live in scripts/bundler-matrix (case
 * `svelte-slim-preset`) and in the `fw-svelte-slim-preset` size fixture. They
 * cannot be made from source, where every module is loaded eagerly. The base
 * `@comvi/core` root is NOT among those absences: `src/slim.ts` re-exports its
 * `createI18n`, so it is in the graph by design.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import * as slim from "../src/slim";
import type { UseI18nLoaderReturn } from "../src/slim";
import * as root from "../src/index";
import SlimPresetHarness from "./SlimPresetHarness.test.svelte";

describe("@comvi/svelte/slim — the one-call preset", () => {
  it("builds a working host from one import, with no @comvi/core specifier", () => {
    const i18n = slim.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.locale).toBe("en");
  });

  it("builds a BARE host — the capabilities are absent, not disabled", () => {
    const i18n = slim.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n.reloadTranslations).toBeUndefined();
    expect(i18n.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n).toBe(false);
    expect("instanceId" in i18n).toBe(false);
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

describe("@comvi/svelte/slim — the capability toolkit", () => {
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

  it("composes a capability the preset host did not have, acquirable through the reader", () => {
    const i18n = slim.attachLoader(
      slim.createI18n({
        locale: "en",
        exposeGlobal: false,
        translation: { en: { greeting: "Hello, {name}!" } },
      }),
    );
    let bag: UseI18nLoaderReturn | undefined;

    component = mount(SlimPresetHarness, {
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

  it("throws at the reader when the preset host has no capability at all", () => {
    const i18n = slim.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(() => mount(SlimPresetHarness, { target, props: { i18n } })).toThrow(
      /no loader capability/,
    );
  });
});

describe("@comvi/svelte/slim — the export surface", () => {
  const TOOLKIT = [
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createI18n",
    "devtools",
    "flattenCatalog",
    "icuCompiler",
    "loader",
    "plugins",
  ];

  it("carries every binding @comvi/svelte does", () => {
    // `createI18n` and `I18n` are the root entry's own construction exports;
    // everything else must exist on both.
    const bindings = Object.keys(root).filter((key) => key !== "createI18n" && key !== "I18n");

    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) expect(slim).toHaveProperty(binding);
  });

  it("adds exactly the preset and the toolkit, and nothing else", () => {
    const added = Object.keys(slim)
      .filter((key) => !(key in root) || key === "createI18n")
      .sort();

    expect(added).toEqual(TOOLKIT);
  });

  it("never re-exports the root class or the side-effectful tags toolbox", () => {
    // `I18n` is core's base class, re-exported by `@comvi/svelte` and left off
    // this entry on purpose: the slim surface publishes one construction
    // export, `createI18n`. `registerTagSyntax` / `prepareTranslation` come
    // from `@comvi/core/tags`, whose import registers tag syntax ambiently, so
    // either of THOSE would put a side effect in every slim graph.
    expect(slim).not.toHaveProperty("I18n");
    expect(slim).not.toHaveProperty("registerTagSyntax");
    expect(slim).not.toHaveProperty("tagSyntaxExtension");
    expect(slim).not.toHaveProperty("prepareTranslation");
  });
});
