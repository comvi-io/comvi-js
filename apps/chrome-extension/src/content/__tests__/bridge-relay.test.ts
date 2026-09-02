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

  it("relays a failed deactivation with its reason", () => {
    dispatch("comvi-extension:deactivated", { success: false, error: "Editor not active" });

    expect(relayed()[0]?.payload).toMatchObject({ success: false, error: "Editor not active" });
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
