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
 * and h3 1.15.11 calls `onAfterResponse` after the handler returned AND after
 * the response was written — for a normal response, for an aborted one, and
 * from `toNodeListener`'s catch for a thrown one. That is the "after the
 * HANDLER has finished" guarantee the `close` event alone cannot give.
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

const teardowns: string[] = [];
const order: string[] = [];
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
  const label = `${String(options.apiKey)}:${String(options.locale)}`;
  return createI18n(options as unknown as Parameters<typeof createI18n>[0]).use(
    definePlugin(() => () => {
      teardowns.push(label);
      order.push(`teardown:${label}`);
    }),
  );
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

    await vi.waitFor(() => expect(teardowns.sort()).toEqual(["nitro:en", "nitro:uk"]));
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

    await vi.waitFor(() => expect(teardowns).toEqual(["boom:en"]));
  });

  it("survives an error hook that carries no event", () => {
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    const errorHook = hooks.get("error") as (error: Error, context: { event?: H3Event }) => unknown;

    // Nitro's `captureError` is called for failures that never had a request.
    expect(() => errorHook(new Error("startup failed"), {})).not.toThrow();
  });
});
