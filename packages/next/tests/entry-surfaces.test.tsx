/**
 * The two `@comvi/next` host surfaces. `/client` and `/server` are ONE surface
 * split by runtime, not by host tier: both export the base `createI18n` and the
 * same capability toolkit, so the contract under test is "one name, one host,
 * on both entries".
 *
 * The ABSENCE claims cannot be made here — from source every module is loaded
 * eagerly, so they live in scripts/bundler-matrix and the size fixtures.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createI18n as createCoreI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import type { WrapperI18nInstance } from "@comvi/core";
import * as core from "@comvi/core";
import * as react from "@comvi/react";
import * as client from "../src/client";
import * as root from "../src/index";
import { nextPlugin, nextPluginLazy } from "../src/nextPlugin";
import { I18nProvider } from "../src/client/I18nProvider";

const wrapperFor = (i18n: WrapperI18nInstance) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider i18n={i18n} locale="en" messages={{}} autoInit={false}>
        {children}
      </I18nProvider>
    );
  };

describe("@comvi/next/client — createI18n", () => {
  it("is core's base constructor, and the retired second name is gone", () => {
    expect(client.createI18n).toBe(createCoreI18n);
    expect(client).not.toHaveProperty("createSlimI18n");
  });

  it("builds a BARE client host that reads a hydrated catalog", () => {
    const i18n = client.createI18n({ locale: "en", exposeGlobal: false });
    i18n.addMessages({ "en:default": { greeting: "Hello, {name}!" } });

    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    // The bare host omits these from its TYPE as well, so reading them at all
    // needs a widened view — the claim under test is that the runtime shape
    // agrees with the type.
    const bare = i18n as { reloadMessages?: unknown; onMissingKey?: unknown };
    expect(bare.reloadMessages).toBeUndefined();
    expect(bare.onMissingKey).toBeUndefined();
    expect("instanceId" in i18n).toBe(false);
  });

  it("takes the ICU COMPILER for an inline catalog — still one package", () => {
    const i18n = client.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: client.icuCompiler,
      messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("takes the SAME compiler option for a catalog that arrives later", () => {
    // The remote/hydration shape: nothing is ingested at construction, and the
    // option still governs whatever is merged afterwards.
    const i18n = client.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: client.icuCompiler,
    });
    i18n.addMessages({
      "en:default": { items: "{count, plural, one {# item} other {# items}}" },
    });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe("2 items");
  });

  it("publishes no `icu` installer on the client entry", () => {
    expect(client).not.toHaveProperty("icu");
  });
});

describe("@comvi/next/client — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(client.icuCompiler).toBe(icuCompiler);
    expect(client.attachLoader).toBe(attachLoader);
    // `flattenCatalog` is NOT re-exported: nested catalogs are base behaviour (C1).
    expect(client).not.toHaveProperty("flattenCatalog");
    // `attachPlugins`/`attachDevtools` are NOT re-exported here: they stay on
    // `@comvi/core/plugins` and `@comvi/core/devtools` for advanced use (P4).
    expect(client).not.toHaveProperty("attachPlugins");
    expect(client).not.toHaveProperty("attachDevtools");
    // The installers are core's own factories, one hop, same rule.
    expect(client.loader).toBe(loader);
    expect(client.plugins).toBe(plugins);
    expect(client.devtools).toBe(devtools);
  });

  it("composes a capability the client host did not have, acquirable through the hook", () => {
    const i18n = client.attachLoader(client.createI18n({ locale: "en", exposeGlobal: false }));

    const { result } = renderHook(() => client.useI18nLoader(), { wrapper: wrapperFor(i18n) });

    expect(typeof result.current.reloadMessages).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("carries the two Next-scoped installers, the same bindings as the root", () => {
    expect(client.nextPlugin).toBe(nextPlugin);
    expect(client.nextPluginLazy).toBe(nextPluginLazy);
    expect(root.nextPlugin).toBe(nextPlugin);
    expect(root.nextPluginLazy).toBe(nextPluginLazy);
  });

  it("carries react's whole 0.5 hook surface, `useI18nInstance` included", () => {
    // The README says this entry re-exports react's 0.5.0 surface. Wave 3 added
    // `useI18nInstance()` there — THE name for "give me the host" in react, solid
    // and svelte — and this entry is react's Next face, so a client component
    // must not have to import `@comvi/react` beside this package to get it.
    for (const name of [
      "useI18n",
      "useI18nInstance",
      "useI18nLoader",
      "useI18nPlugins",
      "useLocale",
      "useIsLoading",
      "useSetLocaleTransition",
      "useFormatters",
    ] as const) {
      expect(typeof client[name], name).toBe("function");
      expect(client[name], name).toBe(react[name]);
    }
  });

  it("returns the provider's own host from useI18nInstance()", () => {
    const i18n = client.createI18n({ locale: "en", exposeGlobal: false });

    const { result } = renderHook(() => client.useI18nInstance(), { wrapper: wrapperFor(i18n) });

    expect(result.current).toBe(i18n);
  });

  it("never re-exports the side-effectful tags toolbox", () => {
    // `registerTagSyntax` comes from ambient `@comvi/core/tags`; the pure
    // `prepareTranslation` toolbox lives on `/rich-text` and reaches this entry
    // only through `<T>`. Neither toolbox is re-exported directly.
    expect(client).not.toHaveProperty("registerTagSyntax");
    expect(client).not.toHaveProperty("tagSyntaxExtension");
    expect(client).not.toHaveProperty("prepareTranslation");
  });
});

describe("@comvi/next — the root carries the toolkit a shared config module needs", () => {
  it("re-exports core's own bindings, the same ones both runtime entries carry", () => {
    // A shared `i18n/config.ts` is imported by both runtimes, so it can name
    // neither `/client` ("use client") nor `/server` (`next/headers`): the
    // installers it composes onto `createNextI18n(…)` come from here.
    expect(root.icuCompiler).toBe(icuCompiler);
    expect(root.attachLoader).toBe(attachLoader);
    expect(root.loader).toBe(loader);
    expect(root.plugins).toBe(plugins);
    expect(root.devtools).toBe(devtools);
    expect(root).not.toHaveProperty("flattenCatalog");
    expect(root).not.toHaveProperty("createNextI18nFromInstance");
    // `attachPlugins`/`attachDevtools` are NOT re-exported here (P4).
    expect(root).not.toHaveProperty("attachPlugins");
    expect(root).not.toHaveProperty("attachDevtools");
  });
});

// `../src/server` is loaded DYNAMICALLY, inside each case, on purpose: the
// module reaches `next/headers` through `getLocale`, a boundary that only
// resolves inside a request scope, so a static top-level import would evaluate
// it for every case in this file — including the client ones above. This is the
// module-loading-boundary exception, not a style preference.
const importServerEntry = () => import("../src/server");

describe("@comvi/next/server — the same surface for the SSR half", () => {
  it("exports the SAME base constructor the client entry does", async () => {
    const server = await importServerEntry();

    // One host under one name on both entries. The runtime split is about which
    // helpers are reachable, never about which constructor you get.
    expect(server.createI18n).toBe(createCoreI18n);
    expect(server.createI18n).toBe(client.createI18n);
    expect(server).not.toHaveProperty("createSlimI18n");
  });

  it("re-exports the same toolkit bindings the client entry does", async () => {
    const server = await importServerEntry();

    expect(server.icuCompiler).toBe(icuCompiler);
    expect(server).not.toHaveProperty("icu");
    expect(server.attachLoader).toBe(attachLoader);
    expect(server).not.toHaveProperty("flattenCatalog");
    // `attachPlugins`/`attachDevtools` are NOT re-exported here (P4).
    expect(server).not.toHaveProperty("attachPlugins");
    expect(server).not.toHaveProperty("attachDevtools");
    expect(server.loader).toBe(loader);
    expect(server.plugins).toBe(plugins);
    expect(server.devtools).toBe(devtools);
    expect(server.nextPlugin).toBe(nextPlugin);
    expect(server.nextPluginLazy).toBe(nextPluginLazy);
  });

  it("never re-exports the side-effectful tags toolbox — that one IS a graph claim", async () => {
    const server = await importServerEntry();

    // Re-exporting these would name `@comvi/core/tags` and register tag syntax
    // ambiently in every server bundle.
    expect(server).not.toHaveProperty("registerTagSyntax");
    expect(server).not.toHaveProperty("tagSyntaxExtension");
    expect(server).not.toHaveProperty("prepareTranslation");
  });

  it("builds a NextServerInstance from one package", async () => {
    const {
      attachLoader: attach,
      createNextI18nFromInstance,
      createI18n,
    } = await importServerEntry();

    const { i18n } = createNextI18nFromInstance(
      () =>
        attach(
          createI18n({
            locale: "en",
            defaultNs: "common",
            exposeGlobal: false,
            messages: { "en:common": { greeting: "Hello, {name}!" } },
          }),
        ),
      { locales: ["en", "de"], defaultLocale: "en" },
    );

    expect(typeof i18n.reloadMessages).toBe("function");
    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
  });
});

describe("@comvi/next — the standalone formatters, on all three entries", () => {
  // Derived from core, so a formatter core adds cannot be left off an entry.
  const CORE_FORMATTERS = Object.keys(core)
    .filter((name) => /^format[A-Z]/.test(name))
    .sort();

  it.each([
    ["root", async () => root],
    ["client", async () => client],
    ["server", importServerEntry],
  ] as const)(
    "%s re-exports exactly core's formatter set, as core's own bindings",
    async (_, load) => {
      const entry = (await load()) as Record<string, unknown>;

      expect(CORE_FORMATTERS.length).toBeGreaterThan(0);
      expect(
        Object.keys(entry)
          .filter((name) => /^format[A-Z]/.test(name))
          .sort(),
      ).toEqual(CORE_FORMATTERS);
      for (const name of CORE_FORMATTERS) {
        expect(entry[name]).toBe((core as Record<string, unknown>)[name]);
      }
    },
  );
});
