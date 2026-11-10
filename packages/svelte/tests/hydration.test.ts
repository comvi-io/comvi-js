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
import GlobalApp from "./fixtures/GlobalApp.svelte";
import RichApp from "./fixtures/RichApp.svelte";
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

/** The probe's rich examples: `components` (a link with an address, a component with props,
 * nested tags, a void `<br>`) and a snippet on the bound <T>. */
const RICH = {
  link: "Read <link>the terms</link>.",
  props: "<b>Bold</b> text",
  nested: "Read <b>the <i>new</i> terms</b>.",
  br: "a<br/>b",
  home: "Go <home>home</home>.",
};
const RICH_HTML = {
  link: 'Read <a href="/terms">the terms</a>.',
  props: '<em class="loud">Bold</em> text',
  nested: 'Read <strong>the <em class="plain">new</em> terms</strong>.',
  br: "a<br>b",
  snippet: 'Go <a href="/">home</a>.',
};

describe("hydration of rich <T>", () => {
  it("the server's markup is kept: same elements, no hydration warning", async () => {
    const m = await vite.ssrLoadModule("/tests/fixtures/server-entry.ts");
    const { body, payload } = m.serveRich(RICH) as { body: string; payload: object };
    const target = document.createElement("div");
    target.innerHTML = body;
    const before = [...target.querySelectorAll("a, em, strong, br")];
    const i18n = createI18n({ locale: "en", timeZone: "UTC", ...payload, onError() {} });
    let app: Record<string, unknown>;
    const logged = await warnings(async () => {
      app = hydrate(RichApp as Component<any>, { target, props: { i18n } });
      flushSync();
      await settle();
    });
    const strip = (s: string) => s.replace(/<!--.*?-->/g, "");
    for (const [id, want] of Object.entries(RICH_HTML))
      expect(strip(target.querySelector(`#${id}`)!.innerHTML)).toBe(want);
    // Hydration adopted the server's nodes, it did not re-create them.
    const after = [...target.querySelectorAll("a, em, strong, br")];
    expect(before.length).toBe(6);
    expect(after.length == before.length && after.every((n, k) => n === before[k])).toBe(true);
    expect(logged).toEqual([]);
    unmount(app!);
  });
});

describe("hydration of useI18n()'s flags (ready/loading scope, check 9)", () => {
  it("the server's branch at the first frame, no hydration warning, no request", async () => {
    const OPTS = { locale: "en", timeZone: "UTC", namespaces: ["default", "nav"] };
    const m = await vite.ssrLoadModule("/tests/fixtures/server-entry.ts");
    const loader = async (_: string, n: string) => (n == "nav" ? {} : { hi: "Hi" });
    const { body, payload } = (await m.serveGlobal({ ...OPTS, loader })) as {
      body: string;
      payload: object;
    };
    expect(body).toContain("<p>Hi</p>");
    const target = document.createElement("div");
    target.innerHTML = body;
    const l = manualLoader();
    const i18n = createI18n({ ...OPTS, ...payload, onError() {}, loader: l.load });
    let app!: Record<string, unknown>;
    const logged = await warnings(async () => {
      app = hydrate(GlobalApp as Component<any>, { target, props: { i18n } });
      flushSync();
      await settle();
    });
    expect([target.querySelector("p")?.textContent, logged, l.requested]).toEqual(["Hi", [], []]);
    await unmount(app);
  });
});
