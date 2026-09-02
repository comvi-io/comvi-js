import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiProxyResponsePayload } from "../../shared/messages";
import {
  createExtensionRuntime,
  createPageWindow,
  recordJsonEvents,
  type ExtensionRuntime,
  type ExtensionRuntimeOptions,
  type PageWindow,
} from "./harness";

const INVALIDATED = "Extension was reloaded. Reload this page to reconnect.";

/**
 * The bridge is the only piece of the extension that runs inside a page, so
 * every way the runtime can fail has to come back as a proxy response instead
 * of an exception escaping into the page's own event dispatch.
 */
describe("ISOLATED-world bridge runtime failures", () => {
  let page: PageWindow;
  let runtime: ExtensionRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function installBridge(options?: ExtensionRuntimeOptions): Promise<void> {
    vi.resetModules();
    page = createPageWindow();
    runtime = createExtensionRuntime(options);
    vi.stubGlobal("window", page);
    vi.stubGlobal("chrome", runtime.chrome);
    await import("../bridge");
  }

  function requestProxy(id: string): void {
    page.dispatchEvent(
      new CustomEvent("comvi-extension:api-request", {
        detail: JSON.stringify({ id, path: "/v1/translations" }),
      }),
    );
  }

  it("forwards a successful proxy response to the page unchanged", async () => {
    await installBridge();
    const answer: ApiProxyResponsePayload = {
      id: "req-1",
      ok: true,
      status: 200,
      statusText: "OK",
      body: '{"keys":[]}',
    };
    runtime.respondWith((_message, respond) => respond(answer));
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-1");

    expect(responses).toEqual([answer]);
  });

  it("reports a Chrome delivery failure as a network error on the response", async () => {
    await installBridge();
    runtime.failNextWith("Could not establish connection. Receiving end does not exist.");
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-2");

    expect(responses).toEqual([
      {
        id: "req-2",
        ok: false,
        status: 0,
        statusText: "",
        body: "",
        networkError: "Could not establish connection. Receiving end does not exist.",
      },
    ]);
  });

  it("substitutes a controlled failure when the extension answers nothing", async () => {
    await installBridge();
    runtime.respondWith((_message, respond) => respond(undefined));
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-3");

    expect(responses).toEqual([
      {
        id: "req-3",
        ok: false,
        status: 0,
        statusText: "",
        body: "",
        networkError: "Extension unavailable",
      },
    ]);
  });

  it("answers the page when the stale world throws instead of reporting delivery status", async () => {
    await installBridge();
    runtime.throwOnLastErrorRead("Extension context invalidated.");
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-stale");

    expect(responses).toEqual([
      {
        id: "req-stale",
        ok: false,
        status: 0,
        statusText: "",
        body: "",
        networkError: INVALIDATED,
      },
    ]);
  });

  it("asks the page to deactivate when the stale world throws on lastError", async () => {
    await installBridge();
    runtime.throwOnLastErrorRead("Extension context invalidated.");
    let deactivations = 0;
    page.addEventListener("comvi-extension:deactivate", () => {
      deactivations += 1;
    });

    requestProxy("req-stale-2");

    expect(deactivations).toBe(1);
  });

  it("keeps using the runtime after an ordinary delivery failure", async () => {
    await installBridge();
    let deactivations = 0;
    page.addEventListener("comvi-extension:deactivate", () => {
      deactivations += 1;
    });
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    runtime.failNextWith("Receiving end does not exist.");
    requestProxy("req-4");
    runtime.respondWith((_message, respond) =>
      respond({ id: "req-5", ok: true, status: 204, statusText: "No Content", body: "" }),
    );
    requestProxy("req-5");

    expect(responses[1]).toMatchObject({ id: "req-5", ok: true, status: 204 });
    expect(deactivations).toBe(0);
  });

  it("stops touching the runtime once the extension context is invalidated", async () => {
    await installBridge();
    runtime.respondWith(() => {
      throw new Error("Extension context invalidated.");
    });
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-6");
    const callsAfterInvalidation = runtime.sent.length;
    requestProxy("req-7");

    expect(runtime.sent.length).toBe(callsAfterInvalidation);
    expect(responses.map((detail) => (detail as ApiProxyResponsePayload).networkError)).toEqual([
      INVALIDATED,
      INVALIDATED,
    ]);
  });

  it("keeps notifying the page silently after the context was invalidated", async () => {
    await installBridge();
    runtime.respondWith(() => {
      throw new Error("Extension context invalidated.");
    });
    requestProxy("req-8");

    expect(() =>
      page.dispatchEvent(
        new CustomEvent("comvi-extension:detected", { detail: { detected: true } }),
      ),
    ).not.toThrow();
  });

  it("announces the document even when the runtime throws on every send", async () => {
    vi.resetModules();
    page = createPageWindow();
    runtime = createExtensionRuntime();
    runtime.respondWith(() => {
      throw new Error("Receiving end does not exist.");
    });
    vi.stubGlobal("window", page);
    vi.stubGlobal("chrome", runtime.chrome);

    await expect(import("../bridge")).resolves.toBeDefined();

    expect(runtime.sent.map((message) => message.type)).toEqual(["DOCUMENT_READY"]);
  });

  it("does not throw into the page when a fire-and-forget notification is answered", async () => {
    await installBridge({ asyncResponses: true });

    page.dispatchEvent(new CustomEvent("comvi-extension:not-found"));

    expect(() => vi.advanceTimersByTime(0)).not.toThrow();
  });

  it("passes a thrown string through as the network error", async () => {
    await installBridge();
    runtime.respondWith(() => {
      throw "service worker asleep";
    });
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-9");

    expect(responses[0]).toMatchObject({ networkError: "service worker asleep" });
  });

  it("falls back to a generic network error for an unreadable failure", async () => {
    await installBridge();
    runtime.respondWith(() => {
      throw { code: 500 };
    });
    const responses = recordJsonEvents(page, "comvi-extension:api-response");

    requestProxy("req-10");

    expect(responses[0]).toMatchObject({ networkError: "Extension unavailable" });
  });

  it("recognises an invalidated context however Chrome capitalises it", async () => {
    await installBridge();
    runtime.respondWith(() => {
      throw new Error("Error: Extension Context Invalidated while sending message");
    });
    const responses = recordJsonEvents(page, "comvi-extension:api-response");
    let deactivations = 0;
    page.addEventListener("comvi-extension:deactivate", () => {
      deactivations += 1;
    });

    requestProxy("req-11");

    expect(responses[0]).toMatchObject({ networkError: INVALIDATED });
    expect(deactivations).toBe(1);
  });
});
