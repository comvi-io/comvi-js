import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../shared/messages";
import {
  createExtensionRuntime,
  createPageWindow,
  recordEvents,
  type ExtensionRuntime,
  type PageWindow,
} from "./harness";

/**
 * Commands arrive from the popup and the service worker. The bridge answers
 * them synchronously and forwards only non-secret data into the page: the
 * activation nonce stays in this isolated world.
 */
describe("ISOLATED-world bridge command surface", () => {
  let page: PageWindow;
  let runtime: ExtensionRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function installBridge(preInstalled = false): Promise<void> {
    vi.resetModules();
    page = createPageWindow();
    runtime = createExtensionRuntime();
    if (preInstalled) {
      page.__comviExtensionBridgeInstalled = true;
    }
    vi.stubGlobal("window", page);
    vi.stubGlobal("chrome", runtime.chrome);
    await import("../bridge");
  }

  function relayed(): Message[] {
    return runtime.sent.slice(1);
  }

  it("answers a status request with the status it last observed", async () => {
    await installBridge();

    const command = runtime.deliver({ type: "GET_STATUS" });

    expect(command.responses).toEqual([
      { type: "STATUS_RESPONSE", payload: { comviDetected: false, editorActive: false } },
    ]);
  });

  it("asks the page for a fresh status while answering a status request", async () => {
    await installBridge();
    let refreshes = 0;
    page.addEventListener("comvi-extension:get-status", () => {
      refreshes += 1;
    });

    runtime.deliver({ type: "GET_STATUS" });

    expect(refreshes).toBe(1);
  });

  it("reports the editor as active once the page acknowledged activation", async () => {
    await installBridge();
    page.dispatchEvent(new CustomEvent("comvi-extension:activated", { detail: { success: true } }));

    const command = runtime.deliver({ type: "GET_STATUS" });

    expect(command.responses[0]).toMatchObject({ payload: { editorActive: true } });
  });

  it("leaves the editor inactive when the page reports a failed activation", async () => {
    await installBridge();
    page.dispatchEvent(
      new CustomEvent("comvi-extension:activated", { detail: { success: false, error: "nope" } }),
    );

    const command = runtime.deliver({ type: "GET_STATUS" });

    expect(command.responses[0]).toMatchObject({ payload: { editorActive: false } });
  });

  it("reports the editor as inactive once the page acknowledged deactivation", async () => {
    await installBridge();
    page.dispatchEvent(new CustomEvent("comvi-extension:activated", { detail: { success: true } }));

    page.dispatchEvent(
      new CustomEvent("comvi-extension:deactivated", { detail: { success: true } }),
    );

    expect(runtime.deliver({ type: "GET_STATUS" }).responses[0]).toMatchObject({
      payload: { editorActive: false },
    });
  });

  it("keeps the editor active when the page reports a failed deactivation", async () => {
    await installBridge();
    page.dispatchEvent(new CustomEvent("comvi-extension:activated", { detail: { success: true } }));

    page.dispatchEvent(
      new CustomEvent("comvi-extension:deactivated", {
        detail: { success: false, error: "Editor not active" },
      }),
    );

    expect(runtime.deliver({ type: "GET_STATUS" }).responses[0]).toMatchObject({
      payload: { editorActive: true },
    });
  });

  it("reports the editor as inactive after an SDK-side lifecycle deactivation", async () => {
    await installBridge();
    page.dispatchEvent(new CustomEvent("comvi-extension:activated", { detail: { success: true } }));

    page.dispatchEvent(
      new CustomEvent("comvi-in-context-editor:lifecycle", { detail: { state: "deactivated" } }),
    );

    expect(runtime.deliver({ type: "GET_STATUS" }).responses[0]).toMatchObject({
      payload: { editorActive: false },
    });
  });

  it("forwards only the non-secret base URL into the page on activation", async () => {
    await installBridge();
    const details = recordEvents(page, "comvi-extension:activate");

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "popup-nonce" },
    });

    expect(details).toEqual([JSON.stringify({ apiBaseUrl: "https://api.comvi.io" })]);
  });

  it("replaces a non-string base URL with an empty one", async () => {
    await installBridge();
    const details = recordEvents(page, "comvi-extension:activate");

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: 42 } as unknown as Message["payload"],
    });

    expect(details).toEqual([JSON.stringify({ apiBaseUrl: "" })]);
  });

  it("activates on a command that carries no payload at all", async () => {
    await installBridge();
    const details = recordEvents(page, "comvi-extension:activate");

    const command = runtime.deliver({ type: "ACTIVATE_EDITOR" });

    expect(details).toEqual([JSON.stringify({ apiBaseUrl: "" })]);
    expect(command.responses).toEqual([{ type: "STATUS_RESPONSE", payload: { pending: true } }]);
  });

  it("acknowledges an activation command as pending", async () => {
    await installBridge();

    const command = runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io" },
    });

    expect(command.responses).toEqual([{ type: "STATUS_RESPONSE", payload: { pending: true } }]);
  });

  it("attaches the popup activation nonce to the acknowledgement it relays", async () => {
    await installBridge();

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "popup-nonce" },
    });
    page.dispatchEvent(
      new CustomEvent("comvi-extension:activated", {
        detail: { success: true, instanceId: "editor-1" },
      }),
    );

    expect(relayed()).toEqual([
      {
        type: "EDITOR_ACTIVATED",
        payload: {
          success: true,
          error: undefined,
          instanceId: "editor-1",
          collectContext: false,
          nonce: "popup-nonce",
        },
      },
    ]);
  });

  it("spends the activation nonce exactly once", async () => {
    await installBridge();

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "popup-nonce" },
    });
    const activated = () =>
      page.dispatchEvent(
        new CustomEvent("comvi-extension:activated", { detail: { success: true } }),
      );
    activated();
    activated();

    expect(relayed().map((message) => (message.payload as { nonce?: string }).nonce)).toEqual([
      "popup-nonce",
      undefined,
    ]);
  });

  it("refuses to carry a non-string nonce", async () => {
    await installBridge();

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: 42 } as unknown as Message["payload"],
    });
    page.dispatchEvent(new CustomEvent("comvi-extension:activated", { detail: { success: true } }));

    expect((relayed()[0]?.payload as { nonce?: string }).nonce).toBeUndefined();
  });

  it("never dispatches the activation nonce into the page", async () => {
    await installBridge();
    const details = recordEvents(page, "comvi-extension:activate");

    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "popup-nonce" },
    });

    expect(JSON.stringify(details)).not.toContain("popup-nonce");
  });

  it("asks the page to deactivate and acknowledges the command as pending", async () => {
    await installBridge();
    let deactivations = 0;
    page.addEventListener("comvi-extension:deactivate", () => {
      deactivations += 1;
    });

    const command = runtime.deliver({ type: "DEACTIVATE_EDITOR" });

    expect(deactivations).toBe(1);
    expect(command.responses).toEqual([{ type: "STATUS_RESPONSE", payload: { pending: true } }]);
  });

  it("ignores a broadcast it has no command for", async () => {
    await installBridge();
    const command = runtime.deliver({ type: "SESSION_STATE_CHANGED", payload: { active: true } });

    expect(command.responses).toEqual([]);
    expect(relayed()).toEqual([]);
  });

  it.each([
    ["GET_STATUS"],
    ["ACTIVATE_EDITOR"],
    ["DEACTIVATE_EDITOR"],
    ["SESSION_STATE_CHANGED"],
  ] as const)("closes the message channel after handling %s", async (type) => {
    await installBridge();

    const command = runtime.deliver({ type } as Message);

    expect(command.keepsChannelOpen).toBe(false);
  });

  it("asks the page for its status shortly after installing", async () => {
    await installBridge();
    let refreshes = 0;
    page.addEventListener("comvi-extension:get-status", () => {
      refreshes += 1;
    });

    vi.advanceTimersByTime(100);

    expect(refreshes).toBe(1);
  });

  it("installs nothing when it finds the bridge already marked as installed", async () => {
    await installBridge(true);

    page.dispatchEvent(new CustomEvent("comvi-extension:not-found"));
    vi.advanceTimersByTime(100);

    expect(runtime.sent).toEqual([]);
  });

  it("relays a page event once after the popup re-injects it into a live page", async () => {
    await installBridge();
    vi.resetModules();
    await import("../bridge");

    page.dispatchEvent(new CustomEvent("comvi-extension:not-found"));

    expect(runtime.sent.map((message) => message.type)).toEqual([
      "DOCUMENT_READY",
      "COMVI_NOT_FOUND",
    ]);
  });
});
