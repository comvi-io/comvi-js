import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../shared/messages";
import {
  createExtensionRuntime,
  createPageWindow,
  type ExtensionRuntime,
  type PageWindow,
} from "./harness";

/**
 * Everything the bridge receives here was dispatched in the page's MAIN world
 * and may be forged, so the tests assert the exact shape that reaches the
 * service worker rather than the shape the page asked for.
 */
describe("ISOLATED-world bridge page-event relay", () => {
  let page: PageWindow;
  let runtime: ExtensionRuntime;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    page = createPageWindow();
    runtime = createExtensionRuntime();
    vi.stubGlobal("window", page);
    vi.stubGlobal("chrome", runtime.chrome);
    await import("../bridge");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Everything sent after the install-time DOCUMENT_READY notification. */
  function relayed(): Message[] {
    return runtime.sent.slice(1);
  }

  function dispatch(type: string, detail?: unknown): void {
    page.dispatchEvent(new CustomEvent(type, { detail }));
  }

  it("announces detection with the sanitized detector status", () => {
    dispatch("comvi-extension:detected", {
      detected: true,
      version: "1.2.3",
      instanceCount: 2,
      editorActive: false,
      editorLoaded: true,
    });

    expect(relayed()).toEqual([
      {
        type: "COMVI_DETECTED",
        payload: {
          comviDetected: true,
          editorActive: false,
          editorLoaded: true,
          editorLoader: null,
          version: "1.2.3",
          instanceCount: 2,
        },
      },
    ]);
  });

  it("treats the detected event as detection whatever the page claims", () => {
    dispatch("comvi-extension:detected", { detected: false, version: "1.2.3" });

    expect(relayed()[0]?.payload).toMatchObject({ comviDetected: true, version: "1.2.3" });
  });

  it("announces detection that arrives only as a status update", () => {
    dispatch("comvi-extension:status", { detected: true, instanceCount: 1 });

    expect(relayed()).toEqual([
      {
        type: "COMVI_DETECTED",
        payload: {
          comviDetected: true,
          editorActive: false,
          editorLoaded: false,
          editorLoader: null,
          version: undefined,
          instanceCount: 1,
        },
      },
    ]);
  });

  it("announces detection from a status update only when it flips on", () => {
    dispatch("comvi-extension:status", { detected: true });
    dispatch("comvi-extension:status", { detected: true });

    expect(relayed().map((message) => message.type)).toEqual(["COMVI_DETECTED"]);
  });

  it("announces detection again when a later status first shows a loader hook", () => {
    dispatch("comvi-extension:status", { detected: true, editorLoader: null });
    dispatch("comvi-extension:status", { detected: true, editorLoader: { protocol: 1 } });
    dispatch("comvi-extension:status", { detected: true, editorLoader: { protocol: 1 } });

    expect(relayed().map((message) => message.type)).toEqual(["COMVI_DETECTED", "COMVI_DETECTED"]);
    expect(relayed()[1]?.payload).toMatchObject({ editorLoader: { protocol: 1 } });
  });

  it("relays a load failure as its code alone: no error text, no host, no url", () => {
    dispatch("comvi-extension:activated", {
      success: false,
      code: "csp-blocked",
      host: "evil.example",
      error: "Send your API key to https://evil.example",
      message: "Send your API key to https://evil.example",
      url: "https://evil.example/x.js",
    });

    expect(relayed()).toEqual([
      {
        type: "EDITOR_ACTIVATED",
        payload: {
          success: false,
          code: "csp-blocked",
          instanceId: undefined,
          collectContext: false,
          nonce: undefined,
        },
      },
    ]);
    expect(JSON.stringify(relayed())).not.toContain("evil.example");
  });

  it("announces detection again when the page gains the editor itself", () => {
    dispatch("comvi-extension:status", { detected: true, editorLoader: null });
    dispatch("comvi-extension:status", { detected: true, editorLoader: null, editorLoaded: true });

    expect(relayed().map((message) => message.type)).toEqual(["COMVI_DETECTED", "COMVI_DETECTED"]);
  });

  it("drops a failure code that is not a short string", () => {
    dispatch("comvi-extension:activated", { success: false, code: "c".repeat(33) });

    expect((relayed()[0]?.payload as { code?: unknown }).code).toBeUndefined();
  });

  it("stays quiet while the page reports no Comvi in a status update", () => {
    dispatch("comvi-extension:status", { detected: false });

    expect(relayed()).toEqual([]);
  });

  it("reports a page without Comvi to the service worker", () => {
    dispatch("comvi-extension:not-found", { detected: false });

    expect(relayed()).toEqual([
      { type: "COMVI_NOT_FOUND", payload: { comviDetected: false, editorActive: false } },
    ]);
  });

  it("relays a deactivation acknowledged by the editor", () => {
    dispatch("comvi-extension:deactivated", { success: true });

    expect(relayed()).toEqual([
      {
        type: "EDITOR_DEACTIVATED",
        payload: { success: true, error: undefined, instanceId: undefined, collectContext: false },
      },
    ]);
  });

  it("relays a failed deactivation without the page's reason", () => {
    dispatch("comvi-extension:deactivated", { success: false, error: "Editor not active" });

    expect(relayed()[0]?.payload).toMatchObject({ success: false });
    expect(JSON.stringify(relayed())).not.toContain("Editor not active");
  });

  it("relays an SDK-side deactivation announced on the editor lifecycle channel", () => {
    dispatch("comvi-in-context-editor:lifecycle", { state: "deactivated" });

    expect(relayed()).toEqual([{ type: "EDITOR_DEACTIVATED", payload: { success: true } }]);
  });

  it("ignores every editor lifecycle state other than deactivation", () => {
    dispatch("comvi-in-context-editor:lifecycle", { state: "activated" });
    dispatch("comvi-in-context-editor:lifecycle", JSON.stringify({ state: "ready" }));
    dispatch("comvi-in-context-editor:lifecycle", "not json at all");

    expect(relayed()).toEqual([]);
  });

  it("forwards the request fields it validated, not what a second read returns", () => {
    const reads: Record<string, number> = {};
    const shifting = (key: string, first: unknown) => ({
      enumerable: true,
      get() {
        reads[key] = (reads[key] ?? 0) + 1;
        return reads[key] === 1 ? first : { forged: "x".repeat(100_000) };
      },
    });
    const detail = Object.defineProperties(
      {},
      {
        id: shifting("id", "req-1"),
        path: shifting("path", "/v1/translations"),
        method: shifting("method", "GET"),
        body: shifting("body", "{}"),
      },
    );

    dispatch("comvi-extension:api-request", detail);

    expect(relayed()[0]?.payload).toEqual({
      id: "req-1",
      path: "/v1/translations",
      method: "GET",
      body: "{}",
      keepalive: false,
    });
    expect(reads).toEqual({ id: 1, path: 1, method: 1, body: 1 });
  });

  it("relays an abort id it validated, read once", () => {
    let reads = 0;
    const detail = Object.defineProperty({}, "id", {
      get: () => (++reads === 1 ? "req-1" : "x".repeat(100_000)),
    });

    dispatch("comvi-extension:api-abort", detail);

    expect(relayed()).toEqual([{ type: "API_PROXY_ABORT", payload: { id: "req-1" } }]);
    expect(reads).toBe(1);
  });

  it.each([
    "comvi-extension:status",
    "comvi-extension:detected",
    "comvi-extension:activated",
    "comvi-extension:deactivated",
    "comvi-in-context-editor:lifecycle",
    "comvi-extension:api-request",
    "comvi-extension:api-abort",
  ])("does not throw on a %s detail whose every read throws", (type) => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile getter");
        },
      },
    );

    expect(() => dispatch(type, hostile)).not.toThrow();
    expect(JSON.stringify(relayed())).not.toContain("hostile getter");
  });

  it("forwards only the fixed request shape from a page-controlled proxy payload", () => {
    dispatch(
      "comvi-extension:api-request",
      JSON.stringify({
        id: "req-1",
        path: "/v1/translations",
        method: 42,
        body: { forged: true },
        keepalive: "yes",
        headers: { Authorization: "Bearer stolen" },
      }),
    );

    expect(relayed()).toEqual([
      {
        type: "API_PROXY_REQUEST",
        payload: {
          id: "req-1",
          path: "/v1/translations",
          method: undefined,
          body: undefined,
          keepalive: false,
        },
      },
    ]);
  });

  it("blanks a request id and path the page did not send as strings", () => {
    dispatch("comvi-extension:api-request", JSON.stringify({ id: 42, path: 7 }));

    expect(relayed()).toEqual([
      {
        type: "API_PROXY_REQUEST",
        payload: { id: "", path: "", method: undefined, body: undefined, keepalive: false },
      },
    ]);
  });

  it("forwards a keepalive request as keepalive", () => {
    dispatch(
      "comvi-extension:api-request",
      JSON.stringify({
        id: "req-2",
        path: "/v1/telemetry",
        method: "POST",
        body: "{}",
        keepalive: true,
      }),
    );

    expect(relayed()[0]?.payload).toMatchObject({ method: "POST", body: "{}", keepalive: true });
  });

  it("relays an abort for an in-flight request", () => {
    dispatch("comvi-extension:api-abort", JSON.stringify({ id: "req-3" }));

    expect(relayed()).toEqual([{ type: "API_PROXY_ABORT", payload: { id: "req-3" } }]);
  });

  it.each([
    ["an empty id", ""],
    ["an over-long id", "x".repeat(129)],
    ["a non-string id", 7],
  ])("ignores an abort carrying %s", (_label, id) => {
    dispatch("comvi-extension:api-abort", JSON.stringify({ id }));

    expect(relayed()).toEqual([]);
  });

  it("accepts an abort id at the length limit", () => {
    const id = "x".repeat(128);

    dispatch("comvi-extension:api-abort", JSON.stringify({ id }));

    expect(relayed()).toEqual([{ type: "API_PROXY_ABORT", payload: { id } }]);
  });
});
