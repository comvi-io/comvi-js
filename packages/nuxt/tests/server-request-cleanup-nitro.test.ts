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
// The real Hookable, because WHEN our teardown starts relative to the other
// handlers of the same `callHook` is the contract under test. It is nitro's own
// dependency and this repo installs shamefully-hoisted, which is how
// `locale-path-real-router.test.ts` reaches `vue-router`.
import { createHooks } from "hookable";
import type { App, H3Event } from "h3";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server, ServerResponse } from "node:http";
import { createI18n } from "@comvi/core";
import { definePlugin } from "@comvi/core/plugins";
import { getRequestI18n } from "../src/runtime/server/utils/request-i18n";
import { REQUEST_HOSTS_KEY } from "../src/runtime/request-hosts-key";
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

/**
 * A Nitro app around a REAL `createHooks()`, with the registration calls
 * recorded so a test can still say HOW the plugin listens.
 */
function fakeNitroApp() {
  const hooks = createHooks();
  const named: string[] = [];
  const afterEachCalls: unknown[] = [];
  const hook = hooks.hook.bind(hooks);
  const afterEach = hooks.afterEach.bind(hooks);
  hooks.hook = ((name: string, fn: never) => {
    named.push(name);
    return hook(name, fn);
  }) as typeof hooks.hook;
  hooks.afterEach = ((fn: never) => {
    afterEachCalls.push(fn);
    return afterEach(fn);
  }) as typeof hooks.afterEach;
  const nitroApp = { hooks } as unknown as Parameters<typeof requestCleanupPlugin>[0];
  return { nitroApp, hooks, named, afterEachCalls };
}

type NitroHooks = ReturnType<typeof createHooks>;

/** What Nitro does at `afterResponse`. */
const callAfterResponse = (hooks: NitroHooks, event: H3Event) =>
  hooks.callHook("afterResponse", event, undefined);

/** What Nitro's `captureError` does. */
const callError = (hooks: NitroHooks, error: Error, context: { event?: H3Event }) =>
  hooks.callHookParallel("error", error, context);

function runtimeConfigFor(id: string) {
  return {
    public: {
      comvi: {
        defaultLocale: "en",
        fallbackLocale: "en",
        defaultNs: "common",
        messages: { "en:common": { hi: "Hello" }, "uk:common": { hi: "Привіт" } },
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

/** Sends a request and pulls the plug as soon as the first chunk lands. */
function getThenAbort(port: number, path: string): Promise<void> {
  return new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      res.once("data", () => {
        req.destroy();
        resolve();
      });
      res.on("end", () => resolve());
    });
    req.on("error", () => resolve());
    req.end();
  });
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
  it("arms from a named error hook and triggers from afterEach", () => {
    // Two registrations, each for a reason. `afterResponse` goes through
    // `afterEach` because a named handler runs in the MIDDLE of the callHook,
    // where a later handler's `event.waitUntil()` is not registered yet. `error`
    // needs a NAMED hook as well, because arming the response-end listeners has
    // to happen before any other error handler can await — by the end of the
    // call a disconnect has already emitted `close`.
    const { nitroApp, named, afterEachCalls } = fakeNitroApp();

    requestCleanupPlugin(nitroApp);

    expect(named).toEqual(["error"]);
    expect(afterEachCalls).toHaveLength(1);
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

    await callAfterResponse(hooks, captured!);

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

    await callError(hooks, new Error("render failed"), { event: captured });

    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["boom:en"]));
  });

  it("survives an error hook that carries no event", () => {
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    // Nitro's `captureError` is called for failures that never had a request.
    expect(() => void callError(hooks, new Error("startup failed"), {})).not.toThrow();
  });

  it("keeps a live request working after a captured non-fatal error", async () => {
    // `event.captureError()`, a swallowed `request`-hook throw and a cache
    // read/write failure all reach this hook on a request that then KEEPS
    // RUNNING. Arming a timer here destroys the hosts mid-request, and the
    // handler's next await lands after it.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
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

        void callError(hooks, new Error("cache read failed"), { event });

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

    const app = createApp({
      onError: async (error, event) => {
        void callError(hooks, error, { event });
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
        // A task that FAILS must not block the teardown. Gated like the one
        // above, so the rejection happens after the wait has attached to it.
        event.waitUntil(
          (async () => {
            await refreshGate;
            throw new Error("a background task failed");
          })(),
        );

        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/cached")).body).toBe("Hello");

    const hookDone = callAfterResponse(hooks, captured!);
    startRefresh();
    await hookDone;

    // Wait for BOTH, so the text below is the text the refresh really produced.
    await vi.waitFor(() => expect(order).toHaveLength(2));
    expect(refreshText).toBe("Hello");
    expect(order).toEqual(["refresh-end", "teardown:swr:en"]);
  });

  it("waits for background work even when the capture arrives after the response ended", async () => {
    // D6: every other path waits for `waitUntil` work; the error hook's
    // already-ended branch did not. `event.captureError()` inside a background
    // task is the documented way to report a non-fatal failure — and Nitro's
    // own cache layer captures with whatever event it was handed, which after
    // the response has ended is exactly this shape.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let taskText = "";
    let startTask: () => void = () => {};
    const taskGate = new Promise<void>((resolve) => {
      startTask = resolve;
    });

    const app = createApp();
    app.use(
      "/cached",
      defineEventHandler(async (event) => {
        responses.set("capture", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("capture");
        const i18n = await getRequestI18n(event, "en");

        event.waitUntil(
          (async () => {
            await taskGate;
            void callError(hooks, new Error("storage read failed"), { event });
            for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
            taskText = i18n.t("hi");
            order.push("task-end");
          })(),
        );

        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/cached")).body).toBe("Hello");
    startTask();

    await vi.waitFor(() => expect(order).toHaveLength(2));
    expect(taskText).toBe("Hello");
    expect(order).toEqual(["task-end", "teardown:capture:en"]);
  });

  it("gives up on background work that keeps registering more, and reports it", async () => {
    // D7: the wait follows work that registers work, so a task that reschedules
    // itself forever would pin the request's hosts — the leak this whole
    // mechanism exists to close, for that one request.
    const reported: { message: string; source: string | undefined }[] = [];
    createComviCore.mockImplementation((options: Record<string, unknown>) =>
      createI18n({
        ...options,
        onError: (error: Error, context?: { source?: string }) => {
          reported.push({ message: error.message, source: context?.source });
        },
      } as unknown as Parameters<typeof createI18n>[0]).use(
        definePlugin(() => () => {
          teardowns.push({ label: "endless:en", writableEnded: true });
          order.push("teardown:endless:en");
          roundsAtTeardown = rounds;
        }),
      ),
    );
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    let rounds = 0;
    let roundsAtTeardown = -1;
    const CHAIN = 120;
    // Each link is paced by a timer and registers the next one only when it
    // finishes, so the chain cannot outrun the wait: exactly one round of the
    // wait per link. A chain of plain microtasks cascades to its end inside a
    // single round and proves nothing. The gate lines the first link up with
    // the wait rather than the socket round trip.
    let startChain: () => void = () => {};
    const chainGate = new Promise<void>((resolve) => {
      startChain = resolve;
    });

    const registerNext = (event: H3Event): void => {
      event.waitUntil(
        (async () => {
          await chainGate;
          await new Promise((resolve) => setTimeout(resolve, 0));
          rounds += 1;
          if (rounds < CHAIN) registerNext(event);
        })(),
      );
    };

    const app = createApp();
    app.use(
      "/endless",
      defineEventHandler(async (event) => {
        captured = event;
        responses.set("endless", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("endless");
        const i18n = await getRequestI18n(event, "en");
        registerNext(event);
        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/endless")).body).toBe("Hello");

    const hookDone = callAfterResponse(hooks, captured!);
    startChain();
    await hookDone;

    await vi.waitFor(() => expect(order).toContain("teardown:endless:en"));
    expect(reported).toHaveLength(1);
    expect(reported[0].source).toBe("request-cleanup");
    expect(reported[0].message).toContain("100");
    // It gave up rather than following the chain to its end.
    expect(roundsAtTeardown).toBeGreaterThanOrEqual(100);
    expect(roundsAtTeardown).toBeLessThan(CHAIN);
  });

  it("reports a background task that rejected", async () => {
    // `allSettled` is what keeps a failed task from blocking the teardown, and
    // attaching that handler is also what hides the rejection from Nitro's
    // unhandled-rejection capture. So the request's own channel hears about it.
    const reported: { message: string; source: string | undefined }[] = [];
    createComviCore.mockImplementation((options: Record<string, unknown>) =>
      createI18n({
        ...options,
        onError: (error: Error, context?: { source?: string }) => {
          reported.push({ message: error.message, source: context?.source });
        },
      } as unknown as Parameters<typeof createI18n>[0]).use(
        definePlugin(() => () => {
          order.push("teardown:rejected:en");
        }),
      ),
    );
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    let failTask: () => void = () => {};
    const taskGate = new Promise<void>((resolve) => {
      failTask = resolve;
    });

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        captured = event;
        responses.set("rejected", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("rejected");
        const i18n = await getRequestI18n(event, "en");
        // Gated, so the rejection lands after the wait has attached to it.
        event.waitUntil(
          (async () => {
            await taskGate;
            throw new Error("revalidation failed");
          })(),
        );
        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/render")).body).toBe("Hello");

    const hookDone = callAfterResponse(hooks, captured!);
    failTask();
    await hookDone;

    await vi.waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0].source).toBe("request-cleanup");
    expect(reported[0].message).toContain("rejected");
    expect(reported[0].message).toContain("revalidation failed");
    // And the teardown still happened.
    await vi.waitFor(() => expect(order).toContain("teardown:rejected:en"));
  });

  it("waits for waitUntil work registered by a LATER afterResponse hook", async () => {
    // Registration order is not ours to choose: another Nitro plugin's
    // `afterResponse` handler runs after this one, and Nitro's own SWR refresh
    // registration lives in exactly that position. Starting the wait inside our
    // own handler snapshots an array that has not been written to yet.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    let backgroundText = "";
    let host: { t: (key: string) => string } | undefined;

    hooks.hook("afterResponse", (event: H3Event) => {
      event.waitUntil(
        (async () => {
          for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
          backgroundText = host!.t("hi");
          order.push("background-end");
        })(),
      );
    });

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        captured = event;
        responses.set("later", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("later");
        host = await getRequestI18n(event, "en");
        return host.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/render")).body).toBe("Hello");

    await callAfterResponse(hooks, captured!);

    await vi.waitFor(() => expect(order).toHaveLength(2));
    expect(backgroundText).toBe("Hello");
    expect(order).toEqual(["background-end", "teardown:later:en"]);
  });

  it("destroys the app plugin's SSR host, parked on the request context, once", async () => {
    // The Vue host the app plugin builds per SSR request is not in the locale
    // registry — it is handed over as data on the event context, because the
    // app bundle and the nitro bundle do not share module state. It has to be
    // destroyed by the same teardown, and exactly once.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    const appHostDestroys: number[] = [];
    const appHost = {
      destroy: vi.fn(async () => {
        appHostDestroys.push(Date.now());
        order.push("teardown:app-host");
      }),
      reportError: vi.fn(),
    };

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        captured = event;
        responses.set("app", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("app");
        // Exactly what `runtime/plugin.ts` does on the server.
        (event.context as Record<string, unknown>)[REQUEST_HOSTS_KEY] = [appHost];
        const i18n = await getRequestI18n(event, "en");
        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/render")).body).toBe("Hello");

    await callAfterResponse(hooks, captured!);
    // A second signal must not destroy it twice.
    await callAfterResponse(hooks, captured!);

    await vi.waitFor(() => expect(order).toContain("teardown:app:en"));
    expect(appHostDestroys).toHaveLength(1);
    expect(order).toEqual(["teardown:app-host", "teardown:app:en"]);
    expect(appHost.reportError).not.toHaveBeenCalled();
  });

  it("destroys once when the client aborts while another error hook is awaiting", async () => {
    // The `error` hook fires at the START of error handling, but our teardown
    // used to be armed from `afterEach` — after every error handler had
    // finished. An error handler that AWAITS (Nitro's own error renderer does)
    // is all it takes: the client disconnects during that await, `close` has
    // already fired by the time the listener goes on, and a thrown handler
    // never reaches `afterResponse`. The host is then retained for good.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let releaseErrorHook: () => void = () => {};
    const errorHookGate = new Promise<void>((resolve) => {
      releaseErrorHook = resolve;
    });
    let aborted: () => void = () => {};
    const abortSeen = new Promise<void>((resolve) => {
      aborted = resolve;
    });

    // Registered AFTER ours, and it awaits — the shape that exposes the timing.
    hooks.hook("error", async () => {
      await errorHookGate;
    });

    const app = createApp({
      onError: async (error, event) => {
        await callError(hooks, error, { event });
      },
    });
    app.use(
      "/boom",
      defineEventHandler(async (event) => {
        responses.set("aborted", event.node.res);
        nitroise(event);
        event.context.runtimeConfig = runtimeConfigFor("aborted");
        const i18n = await getRequestI18n(event, "en");
        event.node.res.writeHead(200, { "content-type": "text/plain" });
        event.node.res.write(i18n.t("hi"));
        await abortSeen;
        throw createError({ statusCode: 500, statusMessage: "render failed" });
      }),
    );
    const port = await serve(app);

    await getThenAbort(port, "/boom");
    // The handler throws now; the awaiting error hook holds error handling open
    // across the disconnect.
    aborted();
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseErrorHook();

    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["aborted:en"]));
  });

  it("reports through the app plugin's host when the request built no other", async () => {
    // A plain page render builds ONLY the app host, so the error channel this
    // teardown reports on has to be that one: looking in the locale registry
    // alone loses the report entirely.
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    const reported: { message: string; source: string | undefined }[] = [];
    const appHost = {
      destroy: vi.fn(async () => {
        order.push("teardown:app-host");
      }),
      reportError: vi.fn((error: Error, context?: { source?: string }) => {
        reported.push({ message: error.message, source: context?.source });
      }),
    };
    let failTask: () => void = () => {};
    const taskGate = new Promise<void>((resolve) => {
      failTask = resolve;
    });

    const app = createApp();
    app.use(
      "/page",
      defineEventHandler((event) => {
        captured = event;
        responses.set("page", event.node.res);
        nitroise(event);
        // What `runtime/plugin.ts` does on the server, and the ONLY host here.
        (event.context as Record<string, unknown>)[REQUEST_HOSTS_KEY] = [appHost];
        event.waitUntil(
          (async () => {
            await taskGate;
            throw new Error("revalidation failed");
          })(),
        );
        return "rendered";
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/page")).body).toBe("rendered");

    const hookDone = callAfterResponse(hooks, captured!);
    failTask();
    await hookDone;

    await vi.waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0].source).toBe("request-cleanup");
    expect(reported[0].message).toContain("revalidation failed");
    await vi.waitFor(() => expect(order).toContain("teardown:app-host"));
  });

  it("falls back to the console when a request has no host to report on", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    const { nitroApp, hooks } = fakeNitroApp();
    requestCleanupPlugin(nitroApp);
    let captured: H3Event | undefined;
    let failTask: () => void = () => {};
    const taskGate = new Promise<void>((resolve) => {
      failTask = resolve;
    });

    const app = createApp();
    app.use(
      "/page",
      defineEventHandler((event) => {
        captured = event;
        nitroise(event);
        event.waitUntil(
          (async () => {
            await taskGate;
            throw new Error("revalidation failed");
          })(),
        );
        return "rendered";
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/page")).body).toBe("rendered");

    const hookDone = callAfterResponse(hooks, captured!);
    failTask();
    await hookDone;

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("revalidation failed")),
    );
  });
});
