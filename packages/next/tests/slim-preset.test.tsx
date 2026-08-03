/**
 * framework-slim DX pass — the `@comvi/next/client` SINGLE-PACKAGE surface.
 *
 * `@comvi/next/client` is not a `/slim` entry. It is next's only client
 * surface and its `createI18n` is the ROOT constructor published in 0.4.x;
 * swapping that binding for the slim one would silently drop ICU plurals and
 * tag syntax out from under an existing app. So the slim host is a second,
 * differently named export — `createSlimI18n` — and the capability toolkit
 * joins it so a next client app never names `@comvi/core` either.
 *
 * The absence claims that need a real bundler — the ROOT entry the sibling
 * `createI18n` names staying out of a `createSlimI18n`-only graph, and the
 * three unused capability subpaths pruning in webpack AND vite, development
 * AND production — live in scripts/bundler-matrix (case
 * `next-client-slim-preset`) and in the `fw-next-client-slim-preset` size
 * fixture. They cannot be made from source, where every module is loaded
 * eagerly.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createI18n as createRootI18n } from "@comvi/core";
import { createI18n as createCoreSlimI18n } from "@comvi/core/slim";
import { attachDevtools } from "@comvi/core/devtools";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader, flattenCatalog } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
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

describe("@comvi/next/client — createSlimI18n", () => {
  it("is core-slim's constructor, not the root one", () => {
    expect(client.createSlimI18n).toBe(createCoreSlimI18n);
    expect(client.createI18n).toBe(createRootI18n);
    expect(client.createSlimI18n).not.toBe(client.createI18n);
  });

  it("builds a BARE client host that reads a hydrated catalog", () => {
    const i18n = client.createSlimI18n({ locale: "en", exposeGlobal: false });
    i18n.addTranslations({ "en:default": { greeting: "Hello, {name}!" } });

    expect(i18n.t("greeting" as never, { name: "world" } as never)).toBe("Hello, world!");
    expect(i18n.reloadTranslations).toBeUndefined();
    expect(i18n.onMissingKey).toBeUndefined();
    expect("instanceId" in i18n).toBe(false);
  });

  it("injects ICU through the re-exported compiler — still one package", () => {
    const i18n = client.createSlimI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: client.icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });
});

describe("@comvi/next/client — the capability toolkit", () => {
  it("re-exports core's own bindings, not copies", () => {
    expect(client.icuCompiler).toBe(icuCompiler);
    expect(client.attachLoader).toBe(attachLoader);
    expect(client.flattenCatalog).toBe(flattenCatalog);
    expect(client.attachPlugins).toBe(attachPlugins);
    expect(client.attachDevtools).toBe(attachDevtools);
  });

  it("composes a capability the client host did not have, acquirable through the hook", () => {
    const i18n = client.attachLoader(client.createSlimI18n({ locale: "en", exposeGlobal: false }));

    const { result } = renderHook(() => client.useI18nLoader(), { wrapper: wrapperFor(i18n) });

    expect(typeof result.current.reloadTranslations).toBe("function");
    // Loader ATTACH is not loader CONFIG: the host has the API, and the app
    // registers its loader through it afterwards.
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("never re-exports the side-effectful tags toolbox", () => {
    // `registerTagSyntax` / `prepareTranslation` come from `@comvi/core/tags`,
    // whose import registers tag syntax ambiently. Either one on this entry
    // would put a side effect in every client graph. `<T>` owns that import.
    expect(client).not.toHaveProperty("registerTagSyntax");
    expect(client).not.toHaveProperty("tagSyntaxExtension");
    expect(client).not.toHaveProperty("prepareTranslation");
  });
});

describe("@comvi/next/server — the single-package server recipe", () => {
  it("re-exports the same bindings the client entry does", async () => {
    const server = await import("../src/server");

    expect(server.createSlimI18n).toBe(createCoreSlimI18n);
    expect(server.attachLoader).toBe(attachLoader);
    expect(server.flattenCatalog).toBe(flattenCatalog);
    expect(server.attachPlugins).toBe(attachPlugins);
    expect(server.icuCompiler).toBe(icuCompiler);
    expect(server.attachDevtools).toBe(attachDevtools);
  });

  it("never re-exports the ROOT constructor — the server graph must not carry it", async () => {
    const server = await import("../src/server");

    // `@comvi/next/client` deliberately keeps its published root `createI18n`;
    // the server companion never had one and must not gain one, or the
    // `next-server-on-slim` absence gate would be a lie waiting to happen.
    expect(server).not.toHaveProperty("createI18n");
    expect(server).not.toHaveProperty("registerTagSyntax");
  });

  it("builds a NextServerHost from one package", async () => {
    const {
      attachLoader: attach,
      createNextI18nFromHost,
      createSlimI18n,
    } = await import("../src/server");

    const { i18n } = createNextI18nFromHost(
      () =>
        attach(
          createSlimI18n({
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
