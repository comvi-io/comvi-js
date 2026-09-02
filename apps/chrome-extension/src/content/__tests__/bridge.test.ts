import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../shared/messages";
import {
  createExtensionRuntime,
  createPageWindow,
  recordJsonEvents,
  type ExtensionRuntime,
  type PageWindow,
} from "./harness";

describe("ISOLATED-world bridge activation ordering", () => {
  let page: PageWindow;
  let runtime: ExtensionRuntime;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    page = createPageWindow();
    runtime = createExtensionRuntime();
    runtime.respondWith((message, respond) => {
      if (message.type === "API_PROXY_REQUEST") {
        const { id } = message.payload as { id: string };
        respond({ id, ok: true, status: 200, statusText: "OK", body: "{}" });
        return;
      }
      respond(undefined);
    });
    vi.stubGlobal("window", page);
    vi.stubGlobal("chrome", runtime.chrome);

    await import("../bridge");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function sentTypes(): string[] {
    return runtime.sent.map((message: Message) => message.type);
  }

  it("forwards activation-time API requests to the service worker authority queue", () => {
    page.addEventListener("comvi-extension:activate", () => {
      page.dispatchEvent(
        new CustomEvent("comvi-extension:api-request", {
          detail: JSON.stringify({ id: "refresh-1", path: "/v1/translations", method: "GET" }),
        }),
      );
      page.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: { success: true, instanceId: "editor-1", collectContext: false },
        }),
      );
    });

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "activation-nonce" },
    });

    expect(sentTypes()).toEqual(["DOCUMENT_READY", "API_PROXY_REQUEST", "EDITOR_ACTIVATED"]);
    expect(runtime.sent[1]).toMatchObject({
      payload: { id: "refresh-1", path: "/v1/translations", method: "GET" },
    });
  });

  it("relays cancellation for an activation-time request", () => {
    page.addEventListener("comvi-extension:activate", () => {
      page.dispatchEvent(
        new CustomEvent("comvi-extension:api-request", {
          detail: JSON.stringify({ id: "refresh-2", path: "/v1/translations" }),
        }),
      );
      page.dispatchEvent(
        new CustomEvent("comvi-extension:api-abort", {
          detail: JSON.stringify({ id: "refresh-2" }),
        }),
      );
      page.dispatchEvent(
        new CustomEvent("comvi-extension:activated", { detail: { success: true } }),
      );
    });

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "activation-nonce" },
    });

    expect(sentTypes()).toEqual([
      "DOCUMENT_READY",
      "API_PROXY_REQUEST",
      "API_PROXY_ABORT",
      "EDITOR_ACTIVATED",
    ]);
  });

  it("turns an invalidated extension context into a controlled proxy failure", () => {
    runtime.respondWith((message) => {
      if (message.type === "API_PROXY_REQUEST") {
        throw new Error("Extension context invalidated.");
      }
    });
    const responses = recordJsonEvents(page, "comvi-extension:api-response");
    let deactivations = 0;
    page.addEventListener("comvi-extension:deactivate", () => {
      deactivations += 1;
    });

    const request = () =>
      page.dispatchEvent(
        new CustomEvent("comvi-extension:api-request", {
          detail: JSON.stringify({ id: "stale-1", path: "/v1/context/handshake" }),
        }),
      );

    request();
    request();

    const controlledFailure = expect.objectContaining({
      id: "stale-1",
      status: 0,
      networkError: "Extension was reloaded. Reload this page to reconnect.",
    });
    expect(responses).toEqual([controlledFailure, controlledFailure]);
    expect(deactivations).toBe(1);
  });
});
