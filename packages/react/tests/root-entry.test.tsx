/**
 * single-entry convergence P2 — the `@comvi/react` SINGLE-PACKAGE root.
 *
 * There is one entry now, and this file pins what it publishes: a one-call
 * `createI18n` on core's BASE host, core's `I18n` class beside it, the react
 * bindings, and named re-exports of the capability toolkit so an app never has
 * to name `@comvi/core`. Behaviour of the hooks on a base host is covered by
 * tests/base-host.test.tsx and the js-contract suites; this file pins the
 * surface itself.
 *
 * The absence claims that need a real bundler — the tag chunks staying out of
 * the graph, and the unused capability subpaths pruning in webpack AND vite,
 * development AND production — live in scripts/bundler-matrix and in the size
 * fixtures. They cannot be made from source, where every module is loaded
 * eagerly. The base `@comvi/core` root is NOT among those absences: this entry
 * re-exports its `createI18n` and `I18n`, so it is in the graph by design.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import { I18n, createI18n } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";
import * as root from "../src/index";

const wrapperFor = (i18n: WrapperI18nHost) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <root.I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </root.I18nProvider>
    );
  };

describe("@comvi/react — the one-call host", () => {
  it("builds a working host from one import, with no @comvi/core specifier", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello, {name}!" } },
    });

    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.locale).toBe("en");
  });

  it("builds a BARE host — the capabilities are absent, not disabled", () => {
    const i18n = root.createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n.reloadTranslations).toBeUndefined();
    expect(i18n.onMissingKey).toBeUndefined();
    expect("registerLoader" in i18n).toBe(false);
    expect("instanceId" in i18n).toBe(false);
  });

  it("injects ICU through the re-exported compiler — still one package", () => {
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: root.icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });
});

describe("@comvi/react — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
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

  it("composes a capability the host did not have, acquirable through the hook", () => {
    const i18n = root.attachLoader(root.createI18n({ locale: "en", exposeGlobal: false }));

    const { result } = renderHook(() => root.useI18nLoader(), { wrapper: wrapperFor(i18n) });

    expect(typeof result.current.reloadTranslations).toBe("function");
    expect(typeof result.current.addActiveNamespace).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("composes AND configures in one expression — the documented recipe", async () => {
    // The target DX, verbatim from the README: host, capability and import
    // map in a single expression, all from `@comvi/react`.
    const i18n = root
      .createI18n({ locale: "en", exposeGlobal: false, compiler: root.icuCompiler })
      .with(
        root.loader({
          en: async () => ({ default: { greeting: "Hello" } }),
          uk: async () => ({ default: { greeting: "Привіт" } }),
        }),
      );

    const { result } = renderHook(() => root.useI18nLoader(), { wrapper: wrapperFor(i18n) });
    expect(typeof result.current.reloadTranslations).toBe("function");
    // Unlike bare `attachLoader`, this one is CONFIGURED.
    expect(typeof i18n.getLoader()).toBe("function");

    await i18n.init();
    expect(i18n.t("greeting" as never)).toBe("Hello");

    await i18n.setLocaleAsync("uk");
    expect(i18n.t("greeting" as never)).toBe("Привіт");
  });

  it("attaching one capability does not smuggle in the other", () => {
    const i18n = root.attachLoader(root.createI18n({ locale: "en", exposeGlobal: false }));

    expect(() => renderHook(() => root.useI18nPlugins(), { wrapper: wrapperFor(i18n) })).toThrow(
      /no plugins capability/,
    );
  });
});

describe("@comvi/react — the export surface", () => {
  // The whole published value surface, in namespace order. A binding that
  // appears here without a decision is a leak; one that disappears is a break.
  const SURFACE = [
    "I18n",
    "I18nProvider",
    "T",
    "attachDevtools",
    "attachLoader",
    "attachPlugins",
    "createI18n",
    "devtools",
    "flattenCatalog",
    "icu",
    "icuCompiler",
    "loader",
    "plugins",
    "useFormatters",
    "useI18n",
    "useI18nContext",
    "useI18nLoader",
    "useI18nPlugins",
    "useIsLoading",
    "useLocale",
    "useSetLocaleTransition",
  ];

  it("publishes exactly the bindings, the toolkit and the two construction names", () => {
    expect(Object.keys(root).sort()).toEqual([...SURFACE].sort());
  });

  it("re-exports core's base `I18n` and `createI18n` by name, not copies", () => {
    expect(root.createI18n).toBe(createI18n);
    expect(root.I18n).toBe(I18n);

    // The one-argument facade survives the wrapper hop, and the class builds
    // the same base host the factory does.
    expect(root.I18n.length).toBe(1);
    const built = new root.I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });
    expect(built).toBeInstanceOf(I18n);
    expect(built.t("greeting" as never)).toBe("Hello");
    expect("registerLoader" in built).toBe(false);
  });

  it("never re-exports the side-effectful tags toolbox", () => {
    // `registerTagSyntax` / `prepareTranslation` come from `@comvi/core/tags`,
    // whose import registers tag syntax ambiently, so re-exporting either
    // would put a side effect in every graph. `<T>` owns that import and is
    // pinned into its own dist chunk (vite.config.ts).
    expect(root).not.toHaveProperty("registerTagSyntax");
    expect(root).not.toHaveProperty("tagSyntaxExtension");
    expect(root).not.toHaveProperty("prepareTranslation");
  });

  it("is ONE entry, so its provider and its hooks share one React context", () => {
    // The retired hazard, asserted from the other side: while `.` and `./slim`
    // were separate build passes their `I18nProvider`/`useI18n()` pairs held
    // distinct context objects and could not see each other. One build cannot
    // split them.
    const i18n = root.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });

    const { result } = renderHook(
      () => ({ context: root.useI18nContext(), bag: root.useI18n(), locale: root.useLocale() }),
      { wrapper: wrapperFor(i18n) },
    );

    expect(result.current.context.i18n).toBe(i18n);
    expect(result.current.locale).toBe("en");
    expect(result.current.bag.t("greeting" as never)).toBe("Hello");
  });
});
