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
 * A document can leave without a replacement bridge announcing itself (a
 * destination with no content script) and can come back from the
 * back/forward cache with its old JavaScript state. Neither may keep or
 * resume proxy authority.
 */
describe("ISOLATED-world bridge page lifecycle", () => {
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

  function relayed(): Message[] {
    return runtime.sent.slice(1);
  }

  function pageTransition(type: "pagehide" | "pageshow", persisted: boolean): Event {
    return Object.assign(new Event(type), { persisted });
  }

  it("answers the worker's liveness check without telling the page", () => {
    const pageEvents = recordEvents(page, "comvi-extension:get-status");

    const command = runtime.deliver({ type: "PING_DOCUMENT" });

    expect(command.responses).toEqual([{ alive: true }]);
    expect(command.keepsChannelOpen).toBe(false);
    expect(pageEvents).toEqual([]);
  });

  it.each([true, false])(
    "gives up this document's authority when it is hidden (persisted: %s)",
    (persisted) => {
      page.dispatchEvent(pageTransition("pagehide", persisted));

      expect(relayed()).toEqual([{ type: "EDITOR_DEACTIVATED", payload: { success: true } }]);
    },
  );

  it("announces a document restored from the back/forward cache as needing fresh activation", () => {
    const teardowns = recordEvents(page, "comvi-extension:deactivate");

    page.dispatchEvent(pageTransition("pageshow", true));

    expect(relayed()).toEqual([{ type: "DOCUMENT_READY", payload: { restored: true } }]);
    // The cached editor runtime may still be active; tear it down so the
    // next popup activation starts it again instead of failing.
    expect(teardowns).toHaveLength(1);
  });

  it("re-announces detection for a restored document that had found Comvi", () => {
    page.dispatchEvent(
      new CustomEvent("comvi-extension:detected", { detail: { version: "1.0.0" } }),
    );
    runtime.sent.length = 1;

    page.dispatchEvent(pageTransition("pageshow", true));

    expect(relayed().map((message) => message.type)).toEqual(["DOCUMENT_READY", "COMVI_DETECTED"]);
  });

  it("drops an activation nonce issued before the document was cached", () => {
    runtime.deliver({
      type: "ACTIVATE_EDITOR",
      payload: { apiBaseUrl: "https://api.comvi.io", nonce: "before-cache" },
    });
    page.dispatchEvent(pageTransition("pageshow", true));
    runtime.sent.length = 1;

    page.dispatchEvent(new CustomEvent("comvi-extension:activated", { detail: { success: true } }));

    expect(relayed()).toEqual([
      { type: "EDITOR_ACTIVATED", payload: expect.objectContaining({ nonce: undefined }) },
    ]);
  });

  it("does nothing on an ordinary first show", () => {
    page.dispatchEvent(pageTransition("pageshow", false));

    expect(relayed()).toEqual([]);
  });
});
