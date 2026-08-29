import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../shared/messages";

type RuntimeListener = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | void;

describe("ISOLATED-world bridge activation ordering", () => {
  let testWindow: EventTarget & Record<string, any>;
  let runtimeListener: RuntimeListener | undefined;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    testWindow = new EventTarget() as EventTarget & Record<string, any>;
    testWindow.setTimeout = setTimeout;
    testWindow.clearTimeout = clearTimeout;
    vi.stubGlobal("window", testWindow);

    sendMessage = vi.fn((message: Message, callback?: (response: unknown) => void) => {
      if (message.type === "API_PROXY_REQUEST") {
        const id = (message.payload as { id: string }).id;
        callback?.({ id, ok: true, status: 200, statusText: "OK", body: "{}" });
      }
    });
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: undefined,
        sendMessage,
        onMessage: {
          addListener: (listener: RuntimeListener) => {
            runtimeListener = listener;
          },
        },
      },
    });

    await import("../bridge");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function deliver(message: Message) {
    runtimeListener?.(message, {} as chrome.runtime.MessageSender, vi.fn());
  }

  it("forwards activation-time API requests to the service worker authority queue", () => {
    testWindow.addEventListener("comvi-extension:activate", () => {
      testWindow.dispatchEvent(
        new CustomEvent("comvi-extension:api-request", {
          detail: JSON.stringify({ id: "refresh-1", path: "/v1/translations", method: "GET" }),
        }),
      );
      testWindow.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: { success: true, instanceId: "editor-1", collectContext: false },
        }),
      );
    });

    deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "activation-nonce" },
    });

    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "DOCUMENT_READY",
      "API_PROXY_REQUEST",
      "EDITOR_ACTIVATED",
    ]);
    expect(sendMessage.mock.calls[1]?.[0]).toMatchObject({
      payload: { id: "refresh-1", path: "/v1/translations", method: "GET" },
    });
  });

  it("relays cancellation for an activation-time request", () => {
    testWindow.addEventListener("comvi-extension:activate", () => {
      testWindow.dispatchEvent(
        new CustomEvent("comvi-extension:api-request", {
          detail: JSON.stringify({ id: "refresh-2", path: "/v1/translations" }),
        }),
      );
      testWindow.dispatchEvent(
        new CustomEvent("comvi-extension:api-abort", {
          detail: JSON.stringify({ id: "refresh-2" }),
        }),
      );
      testWindow.dispatchEvent(
        new CustomEvent("comvi-extension:activated", { detail: { success: true } }),
      );
    });

    deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "activation-nonce" },
    });
    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "DOCUMENT_READY",
      "API_PROXY_REQUEST",
      "API_PROXY_ABORT",
      "EDITOR_ACTIVATED",
    ]);
  });

  it("turns an invalidated extension context into a controlled proxy failure", () => {
    sendMessage.mockImplementation((message: Message) => {
      if (message.type === "API_PROXY_REQUEST") {
        throw new Error("Extension context invalidated.");
      }
    });
    const responses: unknown[] = [];
    let deactivations = 0;
    testWindow.addEventListener("comvi-extension:api-response", ((event: CustomEvent) => {
      responses.push(JSON.parse(event.detail));
    }) as EventListener);
    testWindow.addEventListener("comvi-extension:deactivate", () => {
      deactivations += 1;
    });

    const request = () =>
      testWindow.dispatchEvent(
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
