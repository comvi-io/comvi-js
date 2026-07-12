import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedTransportInit {
  signal?: AbortSignal;
}

type CapturedTransport = (path: string, init?: CapturedTransportInit) => Promise<Response>;

describe("MAIN-world detector transport contract", () => {
  let testWindow: EventTarget & Record<string, any>;
  let transport: CapturedTransport | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    testWindow = new EventTarget() as EventTarget & Record<string, any>;
    testWindow.setTimeout = setTimeout;
    testWindow.clearTimeout = clearTimeout;
    testWindow.__COMVI__ = { version: "test", instances: new Map([["i18n", {}]]) };
    testWindow.ComviInContextEditor = {
      isActive: () => false,
      activate: (options: { transport: CapturedTransport }) => {
        transport = options.transport;
        return { instanceId: "editor-1", collectContext: false };
      },
    };
    vi.stubGlobal("window", testWindow);

    await import("../detector");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports the effective SDK collectContext value in activation acknowledgement", () => {
    let activationDetail: Record<string, unknown> | undefined;
    testWindow.addEventListener("comvi-extension:activated", ((event: CustomEvent) => {
      activationDetail = event.detail;
    }) as EventListener);

    testWindow.dispatchEvent(
      new CustomEvent("comvi-extension:activate", {
        detail: { apiBaseUrl: "https://api.comvi.io", collectContext: true },
      }),
    );

    expect(activationDetail).toEqual({
      success: true,
      instanceId: "editor-1",
      collectContext: false,
    });
  });

  it("dispatches proxy abort before rejecting a timed-out request", async () => {
    testWindow.dispatchEvent(
      new CustomEvent("comvi-extension:activate", {
        detail: { apiBaseUrl: "https://api.comvi.io", collectContext: true },
      }),
    );
    expect(transport).toBeDefined();

    const order: string[] = [];
    testWindow.addEventListener("comvi-extension:api-abort", () => order.push("abort"));
    const request = transport!("/v1/project").catch((error) => {
      order.push("reject");
      throw error;
    });
    const rejection = expect(request).rejects.toThrow("Comvi extension API request timed out");

    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(order).toEqual(["abort", "reject"]);
  });
});
