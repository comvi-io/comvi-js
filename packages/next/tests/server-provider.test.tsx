/**
 * The server `ComviProvider` (`@comvi/next/server`) and its client half.
 *
 * With `withComvi({ config })` both runtimes import the app's config module
 * through `@comvi/next/config`; here `vi.doMock` stands in for the alias, and
 * each runtime gets its own module load and its own host, as Next's server and
 * client builds do. What crosses the boundary is `locale` and the `messages`
 * `loadTranslations` produced, nothing else.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";
import { spyOnConsoleError } from "./helpers/consoleWarnings";

// One test is one request: `cache()` memoizes per module load.
const { reactWithCache } = vi.hoisted(() => ({
  reactWithCache: async (importOriginal: () => Promise<Record<string, unknown>>) => ({
    ...(await importOriginal()),
    cache: (fn: () => unknown) => {
      let cached: unknown;
      return () => (cached ??= fn());
    },
  }),
}));
vi.mock("react", reactWithCache);
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

const CATALOGS: Record<string, Record<string, string>> = {
  "en:default": { greeting: "Hello" },
  "uk:default": { greeting: "Привіт" },
  "en:admin": { title: "Admin" },
  "uk:admin": { title: "Адмін" },
};

type Loaded = {
  ComviProvider: typeof import("../src/server/ComviProvider").ComviProvider;
  ComviClientProvider: typeof import("../src/client/ComviClientProvider").ComviClientProvider;
  loadTranslations: typeof import("../src/server/loadTranslations").loadTranslations;
  getRequestLocaleFromCache: typeof import("../src/server/cache").getRequestLocaleFromCache;
  getI18n: typeof import("../src/server/getI18n").getI18n;
  T: typeof import("@comvi/react").T;
  loader: ReturnType<typeof vi.fn>;
};

/**
 * One runtime: fresh modules, a fresh host from the "config module", and
 * `@comvi/next/config` resolving to it. `withConfig: false` is the app without
 * `withComvi`: the stub resolves, and its exports are `undefined`.
 */
async function runtime({ withConfig = true } = {}): Promise<Loaded> {
  vi.resetModules();
  const { createNextI18n } = await import("../src/createNextI18n");
  const { i18n, routing } = createNextI18n({
    locales: ["en", "uk"],
    defaultLocale: "en",
    fallbackLocale: "en",
    devMode: false,
  });
  const loader = vi.fn(async (locale: string, ns: string) => CATALOGS[`${locale}:${ns}`] ?? {});
  i18n.registerLoader(loader);
  vi.doMock("@comvi/next/config", () =>
    withConfig ? { i18n, routing } : { i18n: undefined, routing: undefined },
  );
  const { ComviProvider } = await import("../src/server/ComviProvider");
  const { ComviClientProvider } = await import("../src/client/ComviClientProvider");
  const { loadTranslations } = await import("../src/server/loadTranslations");
  const { getRequestLocaleFromCache } = await import("../src/server/cache");
  const { getI18n } = await import("../src/server/getI18n");
  const { T } = await import("@comvi/react");
  return {
    ComviProvider,
    ComviClientProvider,
    loadTranslations,
    getRequestLocaleFromCache,
    getI18n,
    T,
    loader,
  };
}

// The first test of a file pays the cold transform of the whole server graph
// (react, next, core); the rest reload it from the transform cache in ms.
// Under a loaded machine that cold load alone can pass the 5 s test budget, so
// pay it here, in a hook with a budget of its own.
beforeAll(async () => {
  await runtime();
}, 60_000);

beforeEach(() => {
  vi.doUnmock("@comvi/next/config");
  document.body.innerHTML = "";
});

describe("ComviProvider (server)", () => {
  it("hands the client exactly what loadTranslations(locale, { namespaces }) returns", async () => {
    const server = await runtime();
    const element = (await server.ComviProvider({
      locale: "uk",
      namespaces: ["default", "admin"],
      children: "child",
    })) as ReactElement<{ locale: string; messages: unknown; children: unknown }>;

    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe(server.ComviClientProvider);
    expect(element.props.locale).toBe("uk");
    expect(element.props.children).toBe("child");
    expect(element.props.messages).toEqual(
      await server.loadTranslations("uk", { namespaces: ["default", "admin"] }),
    );
    expect(Object.keys(element.props.messages as object)).toEqual([
      "uk:default",
      "uk:admin",
      "en:default",
      "en:admin",
    ]);
  });

  it("hands over plain objects: Next cannot serialize a null-prototype catalog", async () => {
    const server = await runtime();
    const element = (await server.ComviProvider({ locale: "uk", children: null })) as ReactElement<{
      messages: Record<string, object>;
    }>;
    const { messages } = element.props;
    expect(Object.getPrototypeOf(messages)).toBe(Object.prototype);
    for (const catalog of Object.values(messages)) {
      expect(Object.getPrototypeOf(catalog)).toBe(Object.prototype);
    }
  });

  it("defaults to the host's default namespace", async () => {
    const server = await runtime();
    const element = (await server.ComviProvider({ locale: "uk", children: null })) as ReactElement<{
      messages: object;
    }>;
    expect(Object.keys(element.props.messages)).toEqual(["uk:default", "en:default"]);
  });

  it("sets the request locale, so the no-argument getI18n() works inside its tree", async () => {
    const server = await runtime();
    await server.ComviProvider({ locale: "uk", children: null });

    expect(server.getRequestLocaleFromCache()).toBe("uk");
    const { t, locale } = await server.getI18n();
    expect(locale).toBe("uk");
    expect(t("greeting" as never)).toBe("Привіт");
  });

  it("throws without withComvi, naming the plugin and the manual wrapper", async () => {
    const server = await runtime({ withConfig: false });
    await expect(server.ComviProvider({ locale: "uk", children: null })).rejects.toThrow(
      "[@comvi/next] <ComviProvider> needs withComvi({ config }) in next.config: " +
        "the client reads the i18n instance from that module. Add it, or keep your own " +
        '"use client" wrapper around <I18nProvider> from @comvi/next/client ' +
        "(the manual setup, also the one for a config whose loader needs server-only code).",
    );
  });
});

describe("ComviClientProvider (client half)", () => {
  it("renders on the server and hydrates on a second host from messages alone", async () => {
    const errors = spyOnConsoleError();

    // Server build: the RSC payload, then SSR of the client tree.
    const server = await runtime();
    const element = (await server.ComviProvider({ locale: "uk", children: null })) as ReactElement<{
      messages: Parameters<Loaded["ComviClientProvider"]>[0]["messages"];
    }>;
    const { messages } = element.props;
    const ssrTree = (
      <server.ComviClientProvider locale="uk" messages={messages}>
        <span data-testid="greeting">
          <server.T i18nKey={"greeting" as never} />
        </span>
      </server.ComviClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(ssrTree);
    document.body.appendChild(container);
    expect(container.textContent).toBe("Привіт");

    // Client build: its own module graph and host; it must fetch nothing.
    const client = await runtime();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(
        container,
        <client.ComviClientProvider locale="uk" messages={messages}>
          <span data-testid="greeting">
            <client.T i18nKey={"greeting" as never} />
          </span>
        </client.ComviClientProvider>,
      );
    });
    expect(container.textContent).toBe("Привіт");
    expect(client.loader).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("throws in a client graph built without the alias", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = await runtime({ withConfig: false });
    expect(() => renderToString(<client.ComviClientProvider locale="uk" messages={{}} />)).toThrow(
      "[@comvi/next] <ComviProvider> needs withComvi({ config }) in next.config",
    );
  });
});
