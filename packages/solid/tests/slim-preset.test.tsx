/**
 * framework-slim DX pass — the `@comvi/solid/slim` SINGLE-PACKAGE surface.
 *
 * What is new here is the ENTRY, not the bindings: a one-call `createI18n`
 * built on core-slim, plus named re-exports of the capability toolkit so an
 * app never has to name `@comvi/core`. Behaviour of the accessors on a slim
 * host is already covered by tests/slim-host.test.tsx and the js-contract
 * suites; this file pins the surface itself.
 *
 * The absence claims that need a real bundler — the root entry and the tag
 * chunks staying out of the graph, and the three unused capability subpaths
 * pruning in webpack AND vite, development AND production — live in
 * scripts/bundler-matrix (case `solid-slim-preset`) and in the
 * `fw-solid-slim-preset` size fixture. They cannot be made from source, where
 * every module is loaded eagerly.
 */
import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { attachDevtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import type { WrapperI18nHost } from "@comvi/core";
import * as slim from "../src/slim";
import * as root from "../src/index";

function underProvider<R>(i18n: WrapperI18nHost, use: () => R) {
  let api!: R;
  const container = document.createElement("div");
  const dispose = render(
    () => (
      <slim.I18nProvider i18n={i18n} autoInit={false}>
        {
          (() => {
            const Probe = () => {
              api = use();
              return <div />;
            };
            return <Probe />;
          })() as never
        }
      </slim.I18nProvider>
    ),
    container,
  );
  dispose();
  return api;
}

describe("@comvi/solid/slim — the one-call preset", () => {
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

describe("@comvi/solid/slim — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(slim.icuCompiler).toBe(icuCompiler);
    expect(slim.attachLoader).toBe(attachLoader);
    expect(slim.flattenCatalog).toBe(flattenCatalog);
    expect(slim.attachPlugins).toBe(attachPlugins);
    expect(slim.attachDevtools).toBe(attachDevtools);
  });

  it("composes a capability the preset host did not have, acquirable through the accessor", () => {
    const i18n = slim.attachLoader(slim.createI18n({ locale: "en", exposeGlobal: false }));

    const bag = underProvider(i18n, () => slim.useI18nLoader());

    expect(typeof bag.reloadTranslations).toBe("function");
    expect(typeof bag.addActiveNamespace).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("attaching one capability does not smuggle in the other", () => {
    const i18n = slim.attachLoader(slim.createI18n({ locale: "en", exposeGlobal: false }));

    expect(() => underProvider(i18n, () => slim.useI18nPlugins())).toThrow(/no plugins capability/);
  });
});

describe("@comvi/solid/slim — the export surface", () => {
  const TOOLKIT = [
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createI18n",
    "flattenCatalog",
    "icuCompiler",
  ];

  it("carries every binding @comvi/solid does", () => {
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
    // `I18n` is the root entry's class; `registerTagSyntax` / `prepareTranslation`
    // come from `@comvi/core/tags`, whose import registers tag syntax ambiently.
    // Either one on this entry would put a side effect in every slim graph.
    expect(slim).not.toHaveProperty("I18n");
    expect(slim).not.toHaveProperty("registerTagSyntax");
    expect(slim).not.toHaveProperty("tagSyntaxExtension");
    expect(slim).not.toHaveProperty("prepareTranslation");
  });
});
