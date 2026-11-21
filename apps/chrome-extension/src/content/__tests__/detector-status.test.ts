import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITOR_VERSION } from "../../shared/protocol";
import {
  createPageWindow,
  protocol2Entry,
  protocol2Handle,
  recordEvents,
  type PageWindow,
} from "./harness";

const POLL_INTERVAL = 100;
const POLLS_BEFORE_GIVING_UP = 30;

const NOTHING = {
  detected: false,
  support: null,
  version: null,
  instanceCount: 0,
  editorActive: false,
  editorVersion: null,
};

describe("MAIN-world detector status reporting", () => {
  let page: PageWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Stage the page, then run the detector against it exactly as an injection would. */
  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  function status(): Record<string, unknown> {
    let detail: Record<string, unknown> | undefined;
    const listener = ((event: CustomEvent) => {
      detail = event.detail as Record<string, unknown>;
    }) as EventListener;
    page.addEventListener("comvi-extension:status", listener);
    page.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
    page.removeEventListener("comvi-extension:status", listener);
    if (!detail) throw new Error("detector did not answer get-status");
    return detail;
  }

  it("announces detection at once on a page that already runs Comvi 0.8", async () => {
    page.__COMVI__ = [protocol2Entry()];
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(detected).toEqual([
      { ...NOTHING, detected: true, support: "compatible", version: "0.8.0", instanceCount: 1 },
    ]);
  });

  // The 0.7 SDK waited for this handshake; 0.8 waits for nothing, and nothing
  // new may be dispatched into every page the extension sees.
  it("dispatches no handshake into the page", async () => {
    page.__COMVI__ = [protocol2Entry()];
    const handshakes = recordEvents(page, "COMVI_PLUGIN_READY");

    await injectDetector();

    expect(handshakes).toEqual([]);
  });

  it("takes no detection from a ready event the page dispatches", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("COMVI_READY", { detail: { version: "2.0.0" } }));

    expect(detected).toEqual([]);
  });

  it("keeps polling a page without Comvi until the last poll of the budget", async () => {
    const notFound = recordEvents(page, "comvi-extension:not-found");
    await injectDetector();

    vi.advanceTimersByTime((POLLS_BEFORE_GIVING_UP - 2) * POLL_INTERVAL);

    expect(notFound).toEqual([]);
  });

  it("gives up on a page without Comvi after the full poll budget", async () => {
    const notFound = recordEvents(page, "comvi-extension:not-found");
    await injectDetector();
    vi.advanceTimersByTime((POLLS_BEFORE_GIVING_UP - 2) * POLL_INTERVAL);

    vi.advanceTimersByTime(POLL_INTERVAL);

    expect(notFound).toEqual([NOTHING]);
  });

  it("stops polling as soon as a late-loading Comvi appears", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    const notFound = recordEvents(page, "comvi-extension:not-found");
    await injectDetector();

    vi.advanceTimersByTime(5 * POLL_INTERVAL);
    page.__COMVI__ = [protocol2Entry()];
    vi.advanceTimersByTime(POLL_INTERVAL);
    vi.advanceTimersByTime(POLLS_BEFORE_GIVING_UP * POLL_INTERVAL);

    expect(detected).toHaveLength(1);
    expect(notFound).toEqual([]);
  });

  it("reports an instance that arrives after the poll budget when asked", async () => {
    await injectDetector();
    vi.advanceTimersByTime(POLLS_BEFORE_GIVING_UP * POLL_INTERVAL);

    page.__COMVI__ = [protocol2Entry()];

    expect(status()).toMatchObject({ detected: true, support: "compatible", instanceCount: 1 });
  });

  it("reports a destroyed instance as gone", async () => {
    const entry = protocol2Entry();
    const queue = [entry];
    page.__COMVI__ = queue;
    await injectDetector();

    queue.splice(queue.indexOf(entry) >>> 0, 1);

    expect(status()).toEqual(NOTHING);
  });

  it("reports no editor before one was activated, even when one is on the page", async () => {
    page.__COMVI__ = [protocol2Entry()];
    const isActive = vi.fn(() => true);
    page.ComviInContextEditor = { isActive, activate: () => null, version: EDITOR_VERSION };
    await injectDetector();

    expect(status()).toMatchObject({ editorActive: false, editorVersion: EDITOR_VERSION });
    // A status read only reads: the page's editor is not called.
    expect(isActive).not.toHaveBeenCalled();
  });

  it("reports the version the editor on the page states, and none for a non-string", async () => {
    page.__COMVI__ = [protocol2Entry()];
    page.ComviInContextEditor = { activate: () => null, version: 8 };
    await injectDetector();

    expect(status()).toMatchObject({ editorVersion: null });
  });

  it("reads no editor version through a getter", async () => {
    page.__COMVI__ = [protocol2Entry()];
    const getter = vi.fn(() => EDITOR_VERSION);
    page.ComviInContextEditor = Object.defineProperty({ activate: () => null }, "version", {
      get: getter,
    });
    await injectDetector();

    expect(status()).toMatchObject({ editorVersion: null });
    expect(getter).not.toHaveBeenCalled();
  });

  it("calls nothing on any entry while reading the status", async () => {
    const x = protocol2Handle();
    page.__COMVI__ = [protocol2Entry(x), protocol2Entry(protocol2Handle({ p: 3 }))];
    await injectDetector();

    status();
    status();

    for (const member of ["read", "state", "mark", "load"] as const) {
      expect(x[member]).not.toHaveBeenCalled();
    }
  });
});

/**
 * The popup re-injects the detector on every open. It must install once per page load, and
 * leave nothing on `window` for the page to see: an installed detector answers a cancelable
 * probe event instead of a global flag.
 */
describe("MAIN-world detector re-injection guard", () => {
  let page: PageWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
    page.__COMVI__ = [protocol2Entry()];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  it("installs nothing when the popup re-injects it into the same page", async () => {
    await injectDetector();
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(detected).toEqual([]);
    expect(page.listenerCount("comvi-extension:get-status")).toBe(1);
    expect(page.listenerCount("comvi-extension:activate")).toBe(1);
  });

  it("leaves no property on the page's window", async () => {
    const before = Object.keys(page).sort();

    await injectDetector();
    await injectDetector();

    expect(Object.keys(page).sort()).toEqual(before);
    expect("__comviExtensionDetectorInstalled" in page).toBe(false);
  });

  it("installs again after an installation that threw", async () => {
    let throwOnce = true;
    const addEventListener = page.addEventListener;
    page.addEventListener = (type, listener) => {
      if (type === "comvi-extension:get-status" && throwOnce) {
        throwOnce = false;
        throw new Error("page broke addEventListener");
      }
      addEventListener(type, listener);
    };
    await expect(injectDetector()).rejects.toThrow("page broke addEventListener");

    await injectDetector();

    expect(page.listenerCount("comvi-extension:get-status")).toBe(1);
  });
});
