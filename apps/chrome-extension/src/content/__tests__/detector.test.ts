import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedTransportInit {
  signal?: AbortSignal;
}

type CapturedTransport = (path: string, init?: CapturedTransportInit) => Promise<Response>;

describe("MAIN-world detector transport contract", () => {
  let testWindow: EventTarget & Record<string, any>;
  let transport: CapturedTransport | undefined;
  let activationOptions: Record<string, unknown> | undefined;

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
        activationOptions = options as unknown as Record<string, unknown>;
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
        detail: { apiBaseUrl: "https://api.comvi.io" },
      }),
    );

    expect(activationOptions).not.toHaveProperty("collectContext");
    expect(activationDetail).toEqual({
      success: true,
      instanceId: "editor-1",
      collectContext: false,
    });
  });

  it("dispatches proxy abort before rejecting a timed-out request", async () => {
    testWindow.dispatchEvent(
      new CustomEvent("comvi-extension:activate", {
        detail: { apiBaseUrl: "https://api.comvi.io" },
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

describe("MAIN-world detector dual-protocol discovery", () => {
  let testWindow: EventTarget & Record<string, any>;

  async function injectDetector(comviGlobal: unknown) {
    vi.resetModules();
    testWindow = new EventTarget() as EventTarget & Record<string, any>;
    testWindow.setTimeout = setTimeout;
    testWindow.clearTimeout = clearTimeout;
    if (comviGlobal !== undefined) {
      testWindow.__COMVI__ = comviGlobal;
    }
    vi.stubGlobal("window", testWindow);
    await import("../detector");
  }

  function requestStatus(): Record<string, any> {
    let status: Record<string, any> | undefined;
    const onStatus = ((event: CustomEvent) => {
      status = event.detail;
    }) as EventListener;
    testWindow.addEventListener("comvi-extension:status", onStatus);
    testWindow.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
    testWindow.removeEventListener("comvi-extension:status", onStatus);
    if (!status) throw new Error("detector did not answer get-status");
    return status;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("drains a v2 queue array on inject and swaps in the array-masquerading hook", async () => {
    const instance = { instanceId: "core-1" };
    await injectDetector([{ v: "2.0.0", i: instance }]);

    const hook = testWindow.__COMVI__;
    expect(Array.isArray(hook)).toBe(true); // masquerade for new core's probe
    expect(hook.__comviEditorHook).toBe(true);
    expect(hook.get("core-1")).toBe(instance);
    expect(requestStatus()).toMatchObject({
      detected: true,
      version: "2.0.0",
      instanceCount: 1,
    });
  });

  it("drains bare legacy instances from a pre-existing array alongside envelopes", async () => {
    const bare = { instanceId: "bare-1" };
    const enveloped = { instanceId: "env-1" };
    await injectDetector([bare, { v: "2.1.0", i: enveloped }]);

    const hook = testWindow.__COMVI__;
    expect(hook.get("bare-1")).toBe(bare);
    expect(hook.get("env-1")).toBe(enveloped);
    expect(requestStatus()).toMatchObject({ detected: true, instanceCount: 2 });
  });

  it("adopts a queue array installed by a late-loading new core via polling", async () => {
    await injectDetector(undefined);

    let detected: Record<string, any> | undefined;
    testWindow.addEventListener("comvi-extension:detected", ((event: CustomEvent) => {
      detected = event.detail;
    }) as EventListener);

    expect(requestStatus()).toMatchObject({ detected: false, instanceCount: 0 });
    // No install-on-empty: a passive detector never plants a global.
    expect(testWindow.__COMVI__).toBeUndefined();

    testWindow.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "late-1" } }];
    await vi.advanceTimersByTimeAsync(100);

    expect(detected).toMatchObject({ detected: true, version: "2.0.0", instanceCount: 1 });
    expect(testWindow.__COMVI__.__comviEditorHook).toBe(true);
  });

  it("accepts both protocols on the installed hook: v2 push and v1 register", async () => {
    await injectDetector([{ v: "2.0.0", i: { instanceId: "first" } }]);
    const hook = testWindow.__COMVI__;

    // New core landing later pushes an envelope (v2).
    const pushed = { instanceId: "second" };
    hook.push({ v: "2.2.0", i: pushed });
    // Old core landing later registers (v1).
    const registered = {};
    hook.register("legacy-1", registered);

    expect(hook.get("second")).toBe(pushed);
    expect(hook.get("legacy-1")).toBe(registered);
    expect(requestStatus()).toMatchObject({ detected: true, instanceCount: 3 });

    hook.remove({ v: "2.2.0", i: pushed });
    hook.unregister("legacy-1");
    expect(requestStatus()).toMatchObject({ detected: true, instanceCount: 1 });
  });

  it("leaves a v1 legacy registry object untouched (v1 path unchanged)", async () => {
    const registry = { version: "1.9.0", instances: new Map([["i18n", {}]]) };
    await injectDetector(registry);

    expect(testWindow.__COMVI__).toBe(registry);
    expect(requestStatus()).toMatchObject({
      detected: true,
      version: "1.9.0",
      instanceCount: 1,
    });
  });

  it("never clobbers a truthy non-conforming global and degrades gracefully", async () => {
    const garbage = { totally: "unrelated" };
    await injectDetector(garbage);

    expect(testWindow.__COMVI__).toBe(garbage);
    // Reported without throwing; no hook is installed over it.
    expect(requestStatus()).toMatchObject({ detected: true, instanceCount: 0 });
    expect(testWindow.__COMVI__).toBe(garbage);
  });

  it("reuses an already-installed editor hook instead of swapping again", async () => {
    const editorHook = Object.assign([], {
      __comviEditorHook: true,
      version: "3.0.0",
      instances: new Map([["editor-owned", {}]]),
      push: () => {},
      remove: () => {},
      register: () => {},
      unregister: () => {},
      get: () => undefined,
    });
    await injectDetector(editorHook);

    expect(testWindow.__COMVI__).toBe(editorHook);
    expect(requestStatus()).toMatchObject({
      detected: true,
      version: "3.0.0",
      instanceCount: 1,
    });
  });
});
