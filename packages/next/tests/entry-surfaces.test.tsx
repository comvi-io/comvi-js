/**
 * single-entry P4 — the two `@comvi/next` host surfaces.
 *
 * `@comvi/next/client` and `@comvi/next/server` are ONE surface split by
 * runtime, not by host tier: both export the base `createI18n` and the same
 * nine-name capability toolkit, so a next app never has to name `@comvi/core`
 * on either side of the boundary. The transitional second constructor name that
 * stood beside `createI18n` for the bare host is DELETED here (it never
 * published; the codemod renames it, §7.2-2), so the contract under test is
 * "one name, one host, on both entries".
 *
 * The absence claims that need a real bundler — core's tag-registration pair
 * and the unused capability subpaths pruning in webpack AND vite, development
 * AND production — live in scripts/bundler-matrix (cases `next-client-default`,
 * `next-client-icu`, `next-server-on-default`) and in the
 * `fw-next-client-default` / `fw-next-server-default-loader` size fixtures.
 * Core's base entry is not one of them: `createI18n` IS its export, so it is in
 * the graph by construction. They cannot be made from source, where every
 * module is loaded eagerly.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createI18n as createCoreI18n } from "@comvi/core";
import { attachDevtools, devtools } from "@comvi/core/devtools";
import { icu, icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";
import type { WrapperI18nHost } from "@comvi/core";
import * as client from "../src/client";
import { I18nProvider } from "../src/client/I18nProvider";

const wrapperFor = (i18n: WrapperI18nHost) =>
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
    i18n.addTranslations({ "en:default": { greeting: "Hello, {name}!" } });

    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.reloadTranslations).toBeUndefined();
    expect(i18n.onMissingKey).toBeUndefined();
    expect("instanceId" in i18n).toBe(false);
  });

  it("takes the ICU COMPILER for an inline catalog — still one package", () => {
    const i18n = client.createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: client.icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("takes the ICU INSTALLER for a catalog that arrives later", () => {
    // The remote/hydration shape: nothing is ingested at construction, so the
    // installer still runs before the compiler locks.
    const i18n = client.createI18n({ locale: "en", exposeGlobal: false }).with(client.icu());
    i18n.addTranslations({
      "en:default": { items: "{count, plural, one {# item} other {# items}}" },
    });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe("2 items");
  });

  it("throws E_COMPILER_LOCKED when the installer runs after ingestion", () => {
    const i18n = client.createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    });

    // The constructor catalog locked the compiler, so the wrong ICU shape fails
    // loud instead of silently doing nothing — this is why the two shapes are
    // documented per catalog source, not as interchangeable spellings.
    let thrown: unknown;
    try {
      i18n.with(client.icu());
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "expected E_COMPILER_LOCKED").toBeInstanceOf(Error);
    expect((thrown as { code?: unknown }).code).toBe("E_COMPILER_LOCKED");
  });
});

describe("@comvi/next/client — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(client.icu).toBe(icu);
    expect(client.icuCompiler).toBe(icuCompiler);
    expect(client.attachLoader).toBe(attachLoader);
    expect(client.flattenCatalog).toBe(flattenCatalog);
    expect(client.attachPlugins).toBe(attachPlugins);
    expect(client.attachDevtools).toBe(attachDevtools);
    // The DX-2 installers are core's own factories, one hop, same rule.
    expect(client.loader).toBe(loader);
    expect(client.plugins).toBe(plugins);
    expect(client.devtools).toBe(devtools);
  });

  it("composes a capability the client host did not have, acquirable through the hook", () => {
    const i18n = client.attachLoader(client.createI18n({ locale: "en", exposeGlobal: false }));

    const { result } = renderHook(() => client.useI18nLoader(), { wrapper: wrapperFor(i18n) });

    expect(typeof result.current.reloadTranslations).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.getLoader()).toBeUndefined();
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

    expect(server.icu).toBe(icu);
    expect(server.icuCompiler).toBe(icuCompiler);
    expect(server.attachLoader).toBe(attachLoader);
    expect(server.flattenCatalog).toBe(flattenCatalog);
    expect(server.attachPlugins).toBe(attachPlugins);
    expect(server.attachDevtools).toBe(attachDevtools);
    expect(server.loader).toBe(loader);
    expect(server.plugins).toBe(plugins);
    expect(server.devtools).toBe(devtools);
  });

  it("never re-exports the side-effectful tags toolbox — that one IS a graph claim", async () => {
    const server = await importServerEntry();

    // Re-exporting these would name `@comvi/core/tags` and break the
    // tag-registration sentinels `fw-next-server-default-loader` pins.
    expect(server).not.toHaveProperty("registerTagSyntax");
    expect(server).not.toHaveProperty("tagSyntaxExtension");
    expect(server).not.toHaveProperty("prepareTranslation");
  });

  it("builds a NextServerHost from one package", async () => {
    const { attachLoader: attach, createNextI18nFromHost, createI18n } = await importServerEntry();

    const { i18n } = createNextI18nFromHost(
      () =>
        attach(
          createI18n({
            locale: "en",
            defaultNs: "common",
            exposeGlobal: false,
            translation: { "en:common": { greeting: "Hello, {name}!" } },
          }),
        ),
      { locales: ["en", "de"], defaultLocale: "en" },
    );

    expect(typeof i18n.reloadTranslations).toBe("function");
    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
  });
});
