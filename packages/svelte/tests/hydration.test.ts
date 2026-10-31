/**
 * A real server render (compiled for the server through Vite) hydrated by the client build:
 * the same branch, 0 requests, no hydration warning, through `handover()`.
 */
import { flushSync, hydrate, unmount, type Component } from "svelte";
import { createServer, type ViteDevServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createI18n, handover, type Catalog } from "../src";
import AccountApp from "./fixtures/AccountApp.svelte";
import { manualLoader, settle, warnings } from "./helpers";

const CORE = resolve(import.meta.dirname, "../../core/src");
let vite: ViteDevServer;

beforeAll(async () => {
  vite = await createServer({
    root: resolve(import.meta.dirname, ".."),
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [svelte({ compilerOptions: { dev: true } })],
    define: { __DEV__: "true", __VERSION__: '"0.0.0-test"' },
    resolve: {
      alias: [
        { find: /^@comvi\/core$/, replacement: `${CORE}/index.ts` },
        { find: /^@comvi\/core\/(.*)$/, replacement: `${CORE}/$1.ts` },
      ],
    },
  });
});
afterAll(() => vite.close());

/** `AccountApp` rendered by the server build, its handover as JSON. */
const serve = async (
  o: Record<string, unknown>,
  load: (l: string) => Promise<Catalog>,
  ns = "account",
) => {
  const m = await vite.ssrLoadModule("/tests/fixtures/server-entry.ts");
  return (await m.serve(o, load, ns)) as { body: string; payload: Record<string, unknown> };
};

const run = async (load: (l: string) => Promise<Catalog>, locale = "en") => {
  const options = { locale, fallbackLocale: "en", timeZone: "UTC", messages: { [locale]: {} } };
  const { body, payload } = await serve(options, load);
  const target = document.createElement("div");
  target.innerHTML = body;
  const l = manualLoader();
  const i18n = createI18n({ ...options, ...payload, onError() {}, loader: l.load });
  let app: Record<string, unknown>;
  const logged = await warnings(async () => {
    app = hydrate(AccountApp as Component<any>, { target, props: { i18n } });
    flushSync();
    await settle();
  });
  return { body, target, logged, l, i18n, stop: () => unmount(app) };
};

describe("hydration of `{#if isReady}`", () => {
  it("loaded on the server: the same text branch, 0 requests, the handover kept after destroy", async () => {
    const r = await run(async () => ({ title: "Account" }));
    expect(r.body).toContain("<p>Account</p>");
    expect(r.target.querySelector("p")!.textContent).toBe("Account");
    expect([r.logged, r.l.requested]).toEqual([[], []]);
    await r.stop();
    expect(r.i18n.t("title", { ns: "account" } as never)).toBe("Account");
    expect(r.l.requested).toEqual([]);
  });

  it("failed on the server with no usable catalog: the same 'unavailable' branch, 0 requests", async () => {
    const r = await run(async () => {
      throw new Error("404");
    });
    expect(r.body).toContain("<b>unavailable</b>");
    expect(r.target.querySelector("b")!.textContent).toBe("unavailable");
    expect([r.logged, r.l.requested]).toEqual([[], []]);
    await r.stop();
  });

  it("served through the fallback locale: the same text branch, 0 requests", async () => {
    const r = await run(async (l) => {
      if (l == "uk") throw new Error("404");
      return { title: "Account" };
    }, "uk");
    expect(r.target.querySelector("p")!.textContent).toBe("Account");
    expect([r.logged, r.l.requested]).toEqual([[], []]);
    await r.stop();
  });

  it("handover() is the core's", () => {
    const i18n = createI18n({ locale: "en", timeZone: "UTC", messages: { en: { a: "b" } } });
    expect(handover(i18n).catalogs.default!.en).toEqual({ a: "b" });
  });
});
