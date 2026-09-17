/**
 * The request host's END of life, driven through a real h3 app.
 *
 * `getRequestI18n` builds one host per locale per request and parks them in a
 * WeakMap. The WeakMap makes them collectable, which is NOT the same as
 * destroyed: a plugin's cleanup (an interval, a socket, a subscription) only
 * runs when someone calls `destroy()`, and on the server nothing ever did.
 * So the contract under test is the user-visible one — a plugin's cleanup runs
 * once per request, after that request's response is off the wire.
 *
 * Everything here goes through `createApp` + `toNodeListener` + `node:http`
 * rather than a hand-made event: the hook hangs off `event.node.res`, and a
 * fake event cannot say whether the response had actually finished.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineEventHandler, getQuery, toNodeListener, toWebHandler } from "h3";
import type { App, H3Event } from "h3";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import type { ClientRequest, Server, ServerResponse } from "node:http";
import { createI18n } from "@comvi/core";
import { definePlugin } from "@comvi/core/plugins";
import { getRequestI18n } from "../src/runtime/server/utils/request-i18n";
import { createComviCore, resetComviHostMock } from "./mocks/comvi-host";
import { resetComviSetupMock } from "./mocks/comvi-setup";

/** One entry per host teardown: which host, and had its response finished? */
interface Teardown {
  label: string;
  writableEnded: boolean;
}

const teardowns: Teardown[] = [];
/** Ordered log for the cases whose contract is "A happens before B". */
const order: string[] = [];
/** The `once(event, …)` names each handler saw registered on ITS response. */
const hookedEvents = new Map<string, string[]>();
const responses = new Map<string, ServerResponse>();

function runtimeConfigFor(id: string) {
  return {
    public: {
      comvi: {
        defaultLocale: "en",
        fallbackLocale: "en",
        defaultNs: "common",
        translation: {
          "en:common": { hi: "Hello" },
          "uk:common": { hi: "Привіт" },
        },
      },
    },
    // The request id rides in on the private config so the host factory can
    // label its own teardown. No module-level "current request" variable, and
    // therefore nothing for concurrent requests to race over.
    comvi: { apiKey: id },
  };
}

/** A real core host whose one plugin records the teardown its cleanup performs. */
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
 * Records every `once` registration made while the handler runs, so a test can
 * say WHICH event the cleanup hangs off — and that a request which never asked
 * for i18n registers nothing at all.
 */
function watchOnce(res: ServerResponse, id: string): string[] {
  const seen: string[] = [];
  const original = res.once.bind(res);
  res.once = ((event: string, listener: (...args: unknown[]) => void) => {
    seen.push(event);
    return original(event, listener);
  }) as ServerResponse["once"];
  hookedEvents.set(id, seen);
  return seen;
}

function startServer(app: App): Promise<{ server: Server; port: number }> {
  const server = createServer(toNodeListener(app));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

let server: Server | undefined;

async function serve(app: App): Promise<number> {
  const started = await startServer(app);
  server = started.server;
  return started.port;
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = createRequest(port, path, (status, body) => resolve({ status, body }));
    req.on("error", reject);
    req.end();
  });
}

function createRequest(
  port: number,
  path: string,
  onDone: (status: number, body: string) => void,
): ClientRequest {
  // node:http rather than `fetch`: the environment here is happy-dom, and the
  // client is not what these tests are about.
  return request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      body += chunk;
    });
    res.on("end", () => onDone(res.statusCode ?? 0, body));
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

describe("request host teardown", () => {
  it("destroys exactly one host per concurrent request, each after its response finished", async () => {
    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        const id = String(getQuery(event).id);
        responses.set(id, event.node.res);
        watchOnce(event.node.res, id);
        event.context.runtimeConfig = runtimeConfigFor(id);

        const i18n = await getRequestI18n(event, "en");
        return `${id}:${i18n.t("hi")}`;
      }),
    );
    const port = await serve(app);

    const ids = ["r1", "r2", "r3", "r4", "r5"];
    const responsesOut = await Promise.all(ids.map((id) => get(port, `/render?id=${id}`)));

    expect(responsesOut.map((r) => r.body).sort()).toEqual(ids.map((id) => `${id}:Hello`));
    await vi.waitFor(() => expect(teardowns).toHaveLength(ids.length));
    expect(teardowns.map((t) => t.label).sort()).toEqual(ids.map((id) => `${id}:en`));
    expect(teardowns.every((t) => t.writableEnded)).toBe(true);
  });

  it("hangs the cleanup off the response's `close` event", async () => {
    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        responses.set("solo", event.node.res);
        watchOnce(event.node.res, "solo");
        event.context.runtimeConfig = runtimeConfigFor("solo");
        await getRequestI18n(event, "en");
        // Snapshot what the handler itself registered; anything h3 or node adds
        // after the handler returns is not this contract.
        hookedEvents.set("solo", [...(hookedEvents.get("solo") ?? [])]);
        return "ok";
      }),
    );
    const port = await serve(app);

    await get(port, "/render");

    expect(hookedEvents.get("solo")).toEqual(["close"]);
    // Registration is not firing: an event name that never emits would keep
    // the assertion above green, so pin the teardown it produced as well.
    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["solo:en"]));
  });

  it("destroys every locale instance a single request built", async () => {
    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        responses.set("multi", event.node.res);
        watchOnce(event.node.res, "multi");
        event.context.runtimeConfig = runtimeConfigFor("multi");

        const en = await getRequestI18n(event, "en");
        const uk = await getRequestI18n(event, "uk");
        return `${en.t("hi")}|${uk.t("hi")}`;
      }),
    );
    const port = await serve(app);

    const response = await get(port, "/render");

    expect(response.body).toBe("Hello|Привіт");
    await vi.waitFor(() => expect(teardowns).toHaveLength(2));
    expect(teardowns.map((t) => t.label).sort()).toEqual(["multi:en", "multi:uk"]);
    // One hook for the request, not one per locale.
    expect(hookedEvents.get("multi")).toEqual(["close"]);
  });

  it("leaves the host alive until a streamed response has been written in full", async () => {
    const chunkSent = { resolve: () => {} };
    const firstChunk = new Promise<void>((resolve) => {
      chunkSent.resolve = resolve;
    });
    let teardownsMidStream = -1;
    let secondChunk = "";

    const app = createApp();
    app.use(
      "/stream",
      defineEventHandler(async (event) => {
        responses.set("streamed", event.node.res);
        watchOnce(event.node.res, "streamed");
        event.context.runtimeConfig = runtimeConfigFor("streamed");

        const i18n = await getRequestI18n(event, "en");
        event.node.res.writeHead(200, { "content-type": "text/plain" });
        event.node.res.write(i18n.t("hi"));
        // The client has the first chunk; the host must still be usable.
        await firstChunk;
        teardownsMidStream = teardowns.length;
        secondChunk = i18n.t("hi");
        event.node.res.end(`|${secondChunk}`);
        return undefined;
      }),
    );
    const port = await serve(app);

    const body = await new Promise<string>((resolve, reject) => {
      const req = createRequest(port, "/stream", (_status, full) => resolve(full));
      req.on("error", reject);
      req.on("response", (res) => {
        res.once("data", () => chunkSent.resolve());
      });
      req.end();
    });

    expect(body).toBe("Hello|Hello");
    expect(teardownsMidStream).toBe(0);
    expect(secondChunk).toBe("Hello");
    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["streamed:en"]));
    expect(teardowns[0].writableEnded).toBe(true);
  });

  it("destroys the request host when the client aborts before the response ends", async () => {
    let closed: () => void = () => {};
    const closedOnServer = new Promise<void>((resolve) => {
      closed = resolve;
    });

    const app = createApp();
    app.use(
      "/stream",
      defineEventHandler(async (event) => {
        responses.set("aborted", event.node.res);
        watchOnce(event.node.res, "aborted");
        event.context.runtimeConfig = runtimeConfigFor("aborted");

        const i18n = await getRequestI18n(event, "en");
        event.node.res.once("close", closed);
        event.node.res.writeHead(200, { "content-type": "text/plain" });
        event.node.res.write(i18n.t("hi"));
        // Never ends: the client pulls the plug instead.
        await closedOnServer;
        return undefined;
      }),
    );
    const port = await serve(app);

    await new Promise<void>((resolve, reject) => {
      const req = createRequest(port, "/stream", () => resolve());
      req.on("error", () => resolve());
      req.on("response", (res) => {
        res.once("data", () => {
          req.destroy();
          resolve();
        });
      });
      req.on("timeout", reject);
      req.end();
    });

    await closedOnServer;
    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["aborted:en"]));
  });

  it("registers no end-of-response hook for a request that never asked for i18n", async () => {
    const app = createApp();
    app.use(
      "/plain",
      defineEventHandler((event) => {
        watchOnce(event.node.res, "plain");
        event.context.runtimeConfig = runtimeConfigFor("plain");
        const seen = [...(hookedEvents.get("plain") ?? [])];
        hookedEvents.set("plain", seen);
        return "no i18n here";
      }),
    );
    const port = await serve(app);

    const response = await get(port, "/plain");

    expect(response.body).toBe("no i18n here");
    expect(hookedEvents.get("plain")).toEqual([]);
    expect(createComviCore).not.toHaveBeenCalled();
    expect(teardowns).toEqual([]);
  });

  it("reports a rejected destroy through the host's reportError, and still answers the request", async () => {
    const reported: { message: string; source: string | undefined }[] = [];
    createComviCore.mockImplementation(() => ({
      locale: "en",
      t: () => "Hello",
      init: vi.fn().mockResolvedValue(undefined),
      setLocaleAsync: vi.fn(),
      destroy: vi.fn().mockRejectedValue(new Error("cleanup exploded")),
      reportError: (error: unknown, context?: { source?: string }) => {
        reported.push({ message: (error as Error).message, source: context?.source });
      },
    }));

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        event.context.runtimeConfig = runtimeConfigFor("boom");
        const i18n = await getRequestI18n(event, "en");
        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    const response = await get(port, "/render");

    expect(response.status).toBe(200);
    expect(response.body).toBe("Hello");
    await vi.waitFor(() =>
      expect(reported).toEqual([{ message: "cleanup exploded", source: "request-cleanup" }]),
    );
  });

  it("skips a locale whose host never finished being created", async () => {
    createComviCore.mockImplementation((options: Record<string, unknown>) => {
      if (options.locale === "uk") {
        return {
          locale: "uk",
          init: vi.fn().mockRejectedValue(new Error("catalog unreachable")),
          setLocaleAsync: vi.fn(),
          destroy: vi.fn(),
          reportError: vi.fn(),
        };
      }
      return hostRecordingTeardown(options);
    });

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        responses.set("partial", event.node.res);
        event.context.runtimeConfig = runtimeConfigFor("partial");

        const en = await getRequestI18n(event, "en");
        await expect(getRequestI18n(event, "uk")).rejects.toThrow("catalog unreachable");
        return en.t("hi");
      }),
    );
    const port = await serve(app);

    const response = await get(port, "/render");

    expect(response.body).toBe("Hello");
    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["partial:en"]));
  });

  it("lets a handler still rendering after an abort finish before the teardown", async () => {
    // The shape that makes this more than cosmetic: `defineCachedEventHandler`
    // and the `swr` / `isr` route rules complete the render of an aborted
    // request and WRITE IT INTO THE CACHE. A host destroyed under that render
    // caches untranslated keys and then serves them to everyone.
    let aborted: () => void = () => {};
    const abortSeen = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    let textAfterAbort = "";

    const app = createApp();
    app.use(
      "/cached",
      defineEventHandler(async (event) => {
        responses.set("cached", event.node.res);
        event.context.runtimeConfig = runtimeConfigFor("cached");

        const i18n = await getRequestI18n(event, "en");
        event.node.res.once("close", aborted);
        event.node.res.writeHead(200, { "content-type": "text/plain" });
        event.node.res.write(i18n.t("hi"));
        await abortSeen;

        // The rest of the render, as microtasks — what a handler that has not
        // yielded to a timer still has in flight when the socket dies.
        for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
        textAfterAbort = i18n.t("hi");
        order.push("handler-end");
        return undefined;
      }),
    );
    const port = await serve(app);

    await new Promise<void>((resolve) => {
      const req = createRequest(port, "/cached", () => resolve());
      req.on("error", () => resolve());
      req.on("response", (res) => {
        res.once("data", () => {
          req.destroy();
          resolve();
        });
      });
      req.end();
    });

    await vi.waitFor(() => expect(order).toContain("teardown:cached:en"));
    expect(textAfterAbort).toBe("Hello");
    expect(order).toEqual(["handler-end", "teardown:cached:en"]);
  });

  it("refuses to build a host for a request whose hosts were already destroyed", async () => {
    let captured: H3Event | undefined;

    const app = createApp();
    app.use(
      "/render",
      defineEventHandler(async (event) => {
        captured = event;
        responses.set("late", event.node.res);
        event.context.runtimeConfig = runtimeConfigFor("late");
        const i18n = await getRequestI18n(event, "en");
        return i18n.t("hi");
      }),
    );
    const port = await serve(app);

    expect((await get(port, "/render")).body).toBe("Hello");
    await vi.waitFor(() => expect(teardowns).toHaveLength(1));

    // A `waitUntil`-shaped task, or a render that outlived its response, asking
    // for a locale it had not asked for yet. Silently building a host here is
    // the leak the teardown exists to close.
    await expect(getRequestI18n(captured!, "uk")).rejects.toThrow(
      "[comvi/nuxt] useTranslation()/loadTranslations() after the response ended",
    );
    await expect(getRequestI18n(captured!, "en")).rejects.toThrow(
      "the request host is already destroyed",
    );
    expect(teardowns).toHaveLength(1);
  });

  it("tears down on the web adapter, where h3 mocks the node response", async () => {
    const app = createApp();
    app.use(
      "/web",
      defineEventHandler(async (event) => {
        responses.set("web", event.node.res);
        watchOnce(event.node.res, "web");
        event.context.runtimeConfig = runtimeConfigFor("web");
        const i18n = await getRequestI18n(event, "en");
        return i18n.t("hi");
      }),
    );

    const response = await toWebHandler(app)(new Request("http://localhost/web"));

    expect(await response.text()).toBe("Hello");
    // h3 1.x builds `event.node.res` from node-mock-http even on the web path,
    // whose `end()` emits `close` synchronously with the body already
    // buffered — so a Cloudflare / Deno / Bun preset DOES get the teardown.
    expect(hookedEvents.get("web")).toEqual(["close"]);
    await vi.waitFor(() => expect(teardowns.map((t) => t.label)).toEqual(["web:en"]));
    expect(teardowns[0].writableEnded).toBe(true);
  });
});
