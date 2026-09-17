/**
 * The Nitro path: the server plugin owns the teardown, and `getRequestI18n`
 * hooks nothing.
 *
 * Why this is a FILE of its own: installing the plugin flips a module-level
 * switch in `request-i18n.ts` and never flips it back — a server either has the
 * plugin or does not. vitest gives each file its own module registry, which is
 * the only isolation that switch needs.
 *
 * Nitro's own hook signatures (nitropack 2.13.4):
 *   afterResponse: (event, response) => void | Promise<void>
 *   error:         (error, { event }) => void
 *
 * h3 1.15.11 calls `onAfterResponse` after the handler returned AND after the
 * response was written — for a normal response and for an aborted one. NOT for
 * a thrown handler under Nitro: the catch in `toNodeListener` runs `onError`
 * first, and `if (event.handled) return` (`dist/index.mjs:2326`) fires before
 * the `onAfterResponse` call because Nitro's `errorHandler` has already sent
 * the response. So the `error` hook is the only signal a thrown handler gives,
 * and it is load-bearing rather than belt-and-braces.
 *
 * `error` is Nitro's `captureError`, which also fires for errors that do NOT
 * end the request — `event.captureError()`, a swallowed `request`-hook throw, a
 * cache read/write failure — so it means "something went wrong", never "the
 * request is over".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, createError, defineEventHandler, toNodeListener } from "h3";
import type { App, H3Event } from "h3";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server, ServerResponse } from "node:http";
import { createI18n } from "@comvi/core";
import { definePlugin } from "@comvi/core/plugins";
import { getRequestI18n } from "../src/runtime/server/utils/request-i18n";
import requestCleanupPlugin from "../src/runtime/server/plugins/request-cleanup";
import { createComviCore, resetComviHostMock } from "./mocks/comvi-host";
import { resetComviSetupMock } from "./mocks/comvi-setup";

interface Teardown {
  label: string;
  writableEnded: boolean;
}

const teardowns: Teardown[] = [];
const order: string[] = [];
const responses = new Map<string, ServerResponse>();
/** The `once(event, …)` names the handler saw registered on its own response. */
const hookedEvents = new Map<string, string[]>();

/** Records what the plugin registered, the way Nitro's Hookable would hold it. */
function fakeNitroApp() {
  const hooks = new Map<string, (...args: never[]) => unknown>();
  const nitroApp = {
    hooks: {
      hook(name: string, fn: (...args: never[]) => unknown) {
        hooks.set(name, fn);
      },
    },
  };
  return { nitroApp, hooks };
}

function runtimeConfigFor(id: string) {
  return {
    public: {
      comvi: {
        defaultLocale: "en",
        fallbackLocale: "en",
        defaultNs: "common",
        translation: { "en:common": { hi: "Hello" }, "uk:common": { hi: "Привіт" } },
      },
    },
    comvi: { apiKey: id },
  };
}

function hostRecordingTeardown(options: Record<string, unknown>) {
  const id = String(options.apiKey);
  const label = `${id}:${String(options.locale)}`;
  return createI18n(options as unknown as Parameters<typeof createI18n>[0]).use(
    definePlugin(() => () => {
      teardowns.push({ label, writableEnded: responses.get(id)?.writableEnded === true });
      order.push(`teardown:${label}`);
    }),
  );
}

/**
 * What Nitro's `onRequest` adds to an event, copied from
 * `nitropack/dist/runtime/internal/app.mjs:47-73`: the `nitro` context and a
 * `waitUntil` that parks promises in `context.nitro._waitUntilPromises`. A
 * cached handler's stale-while-revalidate refresh registers its background
 * render through this same array, under the PARENT event's context
 * (`cache.mjs:87` + `:255`), which is why one test on the array covers both.
 */
function nitroise(event: H3Event): void {
  const context = event.context as {
    nitro?: { errors: unknown[]; _waitUntilPromises?: unknown[] };
  };
  context.nitro = { errors: [] };
  event.waitUntil = (promise: Promise<unknown>) => {
    (context.nitro!._waitUntilPromises ??= []).push(promise);
  };
}

function watchOnce(res: ServerResponse, id: string): void {
  const seen: string[] = [];
  const original = res.once.bind(res);
  res.once = ((event: string, listener: (...args: unknown[]) => void) => {
    seen.push(event);
    return original(event, listener);
  }) as ServerResponse["once"];
  hookedEvents.set(id, seen);
}

let server: Server | undefined;

async function serve(app: App): Promise<number> {
  const started = createServer(toNodeListener(app));
  await new Promise<void>((resolve) => {
    started.listen(0, "127.0.0.1", () => resolve());
  });
  server = started;
  return (started.address() as AddressInfo).port;
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeEach(() => {
  resetComviHostMock();
  resetComviSetupMock();
  teardowns.length = 0;
  order.length = 0;
  hookedEvents.clear();
  responses.clear();
  createComviCore.mockImplementation(hostRecordingTeardown);
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("Nitro server plugin", () => {
  it("registers exactly the two hooks that see a finished request", () => {
    const { nitroApp, hooks } = fakeNitroApp();

    requestCleanupPlugin(nitroApp);

    expect([...hooks.keys()].sort()).toEqual(["afterResponse", "error"]);
  });

  it("destroys the request's hosts from afterResponse, and getRequestI18n hooks nothing", async () => {
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        captured = event;
        watchOnce(event.node.res, "nitro");
        event.context.runtimeConfig = runtimeConfigFor("nitro");
        const en = await getRequestI18n(event, "en");
        const uk = await getRequestI18n(event, "uk");
        order.push("handler-end");
        return `${en.t("hi")}|${uk.t("hi")}`;
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/render")).body).toBe("Hello|Привіт");
    // The plugin owns teardown now, so the response carries no `close` hook of
    // ours: two mechanisms on one request is how a host gets destroyed twice.
    expect(hookedEvents.get("nitro")).toEqual([]);
    expect(teardowns).toEqual([]);

    const afterResponse = hooks.get("afterResponse") as (event: H3Event) => unknown;
    await afterResponse(captured!);

    await vi.waitFor(() =>
      expect(teardowns.map((t) => t.label).sort()).toEqual(["nitro:en", "nitro:uk"]),
    );
    expect(order[0]).toBe("handler-end");
  });

  it("destroys the request's hosts from the error hook", async () => {
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;

    const app = createApp();
    app.use(
      "/boom",
      defineEventHandler(async (event) => {
        captured = event;
        event.context.runtimeConfig = runtimeConfigFor("boom");
        await getRequestI18n(event, "en");
        throw createError({ statusCode: 500, statusMessage: "render failed" });
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/boom")).status).toBe(500);
    expect(teardowns).toEqual([]);

    const errorHook = hooks.get("error") as (error: Error, context: { event?: H3Event }) => unknown;
    await errorHook(new Error("render failed"), { event: captured });

    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["boom:en"]));
  });

  it("survives an error hook that carries no event", () => {
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    const errorHook = hooks.get("error") as (error: Error, context: { event?: H3Event }) => unknown;

    // Nitro's `captureError` is called for failures that never had a request.
    expect(() => errorHook(new Error("startup failed"), {})).not.toThrow();
  });

  it("keeps a live request working after a captured non-fatal error", async () => {
    // `event.captureError()`, a swallowed `request`-hook throw and a cache
    // read/write failure all reach this hook on a request that then KEEPS
    // RUNNING. Arming a timer here destroys the hosts mid-request, and the
    // handler's next await lands after it.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    const errorHook = hooks.get("error") as (error: Error, context: { event?: H3Event }) => unknown;
    let textAfterCapture = "";
    let secondLocale = "";

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        responses.set("live", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("live");
        const i18n = await getRequestI18n(event, "en");

        errorHook(new Error("cache read failed"), { event });

        // The handler's next real await: a fetch, a DB round trip, anything
        // that yields to the macrotask queue.
        await new Promise((resolve) => setTimeout(resolve, 0));

        textAfterCapture = i18n.t("hi");
        secondLocale = (await getRequestI18n(event, "uk")).t("hi");
        order.push("handler-end");
        return `${textAfterCapture}|${secondLocale}`;
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/render")).body).toBe("Hello|Привіт");
    expect(textAfterCapture).toBe("Hello");
    expect(secondLocale).toBe("Привіт");
    // Torn down at the response's end, not by the captured error.
    await vi.waitFor(() =>
      expect(teardowns.map((t) => t.label).sort()).toEqual(["live:en", "live:uk"]),
    );
    expect(teardowns.every((t) => t.writableEnded)).toBe(true);
    expect(order[0]).toBe("handler-end");
  });

  it("tears a thrown handler down only after its error response is written", async () => {
    // Nitro captures BEFORE it sends (`onError: captureError(…); return
    // errorHandler(…)`), and its errorHandler renders an error page, so the
    // response is still open — and asynchronously so — while this hook runs.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    const errorHook = hooks.get("error") as (error: Error, context: { event?: H3Event }) => unknown;

    const app = createApp({
      onError: async (error, event) => {
        errorHook(error, { event });
        // Stands in for rendering the error page.
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    app.use(
      "/boom",
      defineEventHandler(async (event) => {
        responses.set("thrown", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("thrown");
        await getRequestI18n(event, "en");
        throw createError({ statusCode: 500, statusMessage: "render failed" });
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/boom")).status).toBe(500);

    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["thrown:en"]));
    expect(teardowns[0].writableEnded).toBe(true);
  });

  it("waits for the event's waitUntil work before destroying", async () => {
    // `event.waitUntil` is the documented way to keep working after responding,
    // and it is also how a cached handler registers its stale-while-revalidate
    // refresh — under the PARENT event's context, which is the teardown key.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    let refreshText = "";
    // The refresh must still be in flight when `afterResponse` fires; a timer
    // would have finished during the socket round trip and proved nothing.
    let startRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      startRefresh = resolve;
    });

    const app = createApp();
    app.use(
      "/cached",
      defineEventHandler(async (event) => {
        captured = event;
        responses.set("swr", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("swr");
        const i18n = await getRequestI18n(event, "en");

        event.waitUntil(
          (async () => {
            await refreshGate;
            // The rest of the background render, as microtasks.
            for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
            refreshText = i18n.t("hi");
            order.push("refresh-end");
          })(),
        );

        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/cached")).body).toBe("Hello");

    const afterResponse = hooks.get("afterResponse") as (event: H3Event) => unknown;
    const hookDone = afterResponse(captured!);
    startRefresh();
    await hookDone;

    // Wait for BOTH, so the text below is the text the refresh really produced.
    await vi.waitFor(() => expect(order).toHaveLength(2));
    expect(refreshText).toBe("Hello");
    expect(order).toEqual(["refresh-end", "teardown:swr:en"]);
  });
});
