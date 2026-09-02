import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageWindow, recordEvents, type PageWindow } from "./harness";

const POLL_INTERVAL = 100;
const POLLS_BEFORE_GIVING_UP = 30;

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

  it("announces detection at once on a page that already runs Comvi", async () => {
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "i18n" } }];
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(detected).toEqual([
      {
        detected: true,
        version: "2.0.0",
        instanceCount: 1,
        editorActive: false,
        editorLoaded: false,
      },
    ]);
  });

  it("completes the handshake Comvi waits for when detection succeeds", async () => {
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "i18n" } }];
    let handshakes = 0;
    page.addEventListener("COMVI_PLUGIN_READY", () => {
      handshakes += 1;
    });

    await injectDetector();

    expect(handshakes).toBe(1);
  });

  it("announces detection only once however often Comvi reports itself", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("COMVI_READY", { detail: { version: "2.0.0" } }));
    page.dispatchEvent(new CustomEvent("COMVI_READY", { detail: { version: "2.0.0" } }));

    expect(detected).toHaveLength(1);
  });

  it("announces detection from the SDK's ready handshake", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    await injectDetector();

    page.dispatchEvent(
      new CustomEvent("COMVI_READY", { detail: { version: "2.5.0", instanceCount: 3 } }),
    );

    expect(detected).toEqual([
      {
        detected: true,
        version: "2.5.0",
        instanceCount: 3,
        editorActive: false,
        editorLoaded: false,
      },
    ]);
  });

  it("assumes a single unversioned instance when the ready handshake carries nothing", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("COMVI_READY"));

    expect(detected).toEqual([
      {
        detected: true,
        version: null,
        instanceCount: 1,
        editorActive: false,
        editorLoaded: false,
      },
    ]);
  });

  it("ignores implausible values in the ready handshake", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    await injectDetector();

    page.dispatchEvent(
      new CustomEvent("COMVI_READY", { detail: { version: 2, instanceCount: "many" } }),
    );

    expect(detected[0]).toMatchObject({ version: null, instanceCount: 1 });
  });

  it("reports the editor runtime as loaded in the ready handshake when it is present", async () => {
    page.ComviInContextEditor = { isActive: () => false };
    const detected = recordEvents(page, "comvi-extension:detected");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("COMVI_READY"));

    expect(detected[0]).toMatchObject({ editorLoaded: true, editorActive: false });
  });

  it("gives up on a page without Comvi after the full poll budget", async () => {
    const notFound = recordEvents(page, "comvi-extension:not-found");
    await injectDetector();

    vi.advanceTimersByTime((POLLS_BEFORE_GIVING_UP - 2) * POLL_INTERVAL);
    expect(notFound).toEqual([]);
    vi.advanceTimersByTime(POLL_INTERVAL);

    expect(notFound).toEqual([
      {
        detected: false,
        version: null,
        instanceCount: 0,
        editorActive: false,
        editorLoaded: false,
      },
    ]);
  });

  it("stops polling as soon as a late-loading Comvi appears", async () => {
    const detected = recordEvents(page, "comvi-extension:detected");
    const notFound = recordEvents(page, "comvi-extension:not-found");
    await injectDetector();

    vi.advanceTimersByTime(5 * POLL_INTERVAL);
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "late" } }];
    vi.advanceTimersByTime(POLL_INTERVAL);
    vi.advanceTimersByTime(POLLS_BEFORE_GIVING_UP * POLL_INTERVAL);

    expect(detected).toHaveLength(1);
    expect(notFound).toEqual([]);
  });

  it("reports an active editor runtime", async () => {
    page.__COMVI__ = { version: "1.9.0", instances: new Map([["i18n", {}]]) };
    page.ComviInContextEditor = { isActive: () => true };
    await injectDetector();

    expect(status()).toEqual({
      detected: true,
      version: "1.9.0",
      instanceCount: 1,
      editorActive: true,
      editorLoaded: true,
    });
  });

  it("reports a loaded but idle editor runtime", async () => {
    page.__COMVI__ = { version: "1.9.0", instances: new Map([["i18n", {}]]) };
    page.ComviInContextEditor = { isActive: () => false };
    await injectDetector();

    expect(status()).toMatchObject({ editorActive: false, editorLoaded: true });
  });

  it("reports no editor runtime on a page where none was injected", async () => {
    page.__COMVI__ = { version: "1.9.0", instances: new Map([["i18n", {}]]) };
    await injectDetector();

    expect(status()).toEqual({
      detected: true,
      version: "1.9.0",
      instanceCount: 1,
      editorActive: false,
      editorLoaded: false,
    });
  });

  it("survives an editor runtime that exposes no isActive hook", async () => {
    page.__COMVI__ = { version: "1.9.0", instances: new Map([["i18n", {}]]) };
    page.ComviInContextEditor = {};
    await injectDetector();

    expect(status()).toMatchObject({ editorActive: false, editorLoaded: true });
  });

  it("installs nothing when the popup re-injects it into the same page", async () => {
    page.__comviExtensionDetectorInstalled = true;
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "i18n" } }];
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(detected).toEqual([]);
    expect(page.listenerCount("comvi-extension:get-status")).toBe(0);
  });

  it("marks the page so a re-injection can tell the detector already ran", async () => {
    await injectDetector();

    expect(page.__comviExtensionDetectorInstalled).toBe(true);
  });
});
