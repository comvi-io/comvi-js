import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageWindow, recordEvents, type PageWindow } from "./harness";

const LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");
const EDITOR_LOAD_BUDGET_MS = 12_000;
const CDN_URL =
  "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js";

type Slots = Record<symbol, unknown>;

/**
 * The extension carries no editor: the detector asks the page's `devtools()`
 * hook (contracts/chrome-extension-proxy.json, `editorLoader`) to load it. The
 * hook is page code, so every case below also covers a hook that lies, throws
 * or stays silent.
 */
describe("MAIN-world detector editor loading", () => {
  let page: PageWindow;
  let activations: unknown[];
  let createElement: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
    // @comvi/core 0.6.0: one announced instance.
    page.__COMVI__ = [{ v: "0.6.0", i: { instanceId: "i18n" } }];
    activations = [];
    createElement = vi.fn();
    vi.stubGlobal("document", { createElement });
  });

  afterEach(() => {
    delete (globalThis as Slots)[LOADER_KEY];
    vi.useRealTimers();
  });

  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  function installSlot(slot: unknown): void {
    (globalThis as Slots)[LOADER_KEY] = slot;
  }

  /** The hook as core 0.6.0 installs it, with `load()` under the test's control. */
  function slotWith(load: () => unknown, extra: Record<string, unknown> = {}) {
    const slot = {
      protocol: 1,
      sdkVersion: "0.6.0",
      editorVersion: "latest",
      url: CDN_URL,
      load: vi.fn(load),
      ...extra,
    };
    installSlot(slot);
    return slot;
  }

  /** What the standalone editor puts on the page once its script ran. */
  function plantEditor(version: unknown = "0.6.0"): void {
    page.ComviInContextEditor = {
      version,
      isActive: () => false,
      activate: (options: unknown) => {
        activations.push(options);
        return { instanceId: "editor-1", collectContext: false };
      },
    };
  }

  const loaded = { ok: true, url: CDN_URL, sdkVersion: "0.6.0", protocol: 1 };

  function activate(): void {
    page.dispatchEvent(
      new CustomEvent("comvi-extension:activate", {
        detail: JSON.stringify({ apiBaseUrl: "https://api.comvi.io" }),
      }),
    );
  }

  function status(): Record<string, unknown> {
    const reported = recordEvents(page, "comvi-extension:status");
    page.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
    return reported[0] as Record<string, unknown>;
  }

  /** Let the promise chain between `load()` settling and the answer run. */
  const settle = () => vi.advanceTimersByTimeAsync(0);

  // --- status: how the popup tells an old SDK from a current one ---

  it("reports the loader hook a 0.6.0 site installed", async () => {
    slotWith(() => loaded);
    await injectDetector();

    expect(status()).toMatchObject({
      detected: true,
      version: "0.6.0",
      editorLoaded: false,
      editorLoader: { protocol: 1, sdkVersion: "0.6.0", editorVersion: "latest" },
    });
  });

  it("reports no loader hook on a site that runs @comvi/core 0.5.0", async () => {
    page.__COMVI__ = [{ v: "0.5.0", i: { instanceId: "i18n" } }];
    await injectDetector();

    expect(status()).toMatchObject({ detected: true, version: "0.5.0", editorLoader: null });
  });

  it("reports neither an instance nor a hook on a site without devtools()", async () => {
    page.__COMVI__ = undefined;
    await injectDetector();

    expect(status()).toMatchObject({ detected: false, editorLoader: null, editorLoaded: false });
  });

  it.each([
    ["has no load function", { protocol: 1, sdkVersion: "0.6.0" }],
    ["announces protocol 0", { protocol: 0, load: () => loaded }],
    ["announces a fractional protocol", { protocol: 1.5, load: () => loaded }],
    ["is not an object", "loader"],
  ])("ignores a slot that %s", async (_label, slot) => {
    installSlot(slot);
    await injectDetector();

    expect(status().editorLoader).toBeNull();
  });

  it("reads a slot whose getter throws as no hook, and still reports the instance", async () => {
    installSlot(
      Object.defineProperty({}, "load", {
        get() {
          throw new Error("hostile getter");
        },
      }),
    );
    await injectDetector();

    expect(status()).toMatchObject({ detected: true, editorLoader: null });
  });

  it("drops hook versions that are not strings", async () => {
    slotWith(() => loaded, { sdkVersion: { toString: () => "0.6.0" }, editorVersion: 5 });
    await injectDetector();

    expect(status().editorLoader).toEqual({
      protocol: 1,
      sdkVersion: undefined,
      editorVersion: undefined,
    });
  });

  it("reports the version a loaded editor states about itself", async () => {
    plantEditor("0.5.3");
    await injectDetector();

    expect(status()).toMatchObject({ editorLoaded: true, editorVersion: "0.5.3" });
  });

  it("reports no editor version when the editor states none", async () => {
    plantEditor(null);
    await injectDetector();

    expect(status()).toMatchObject({ editorLoaded: true, editorVersion: null });
  });

  // --- activation ---

  it("loads the editor through the hook and then activates it", async () => {
    const slot = slotWith(async () => {
      plantEditor();
      return loaded;
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(slot.load).toHaveBeenCalledTimes(1);
    expect(activations).toEqual([
      { transport: expect.any(Function), apiBaseUrl: "https://api.comvi.io" },
    ]);
    expect(results).toEqual([{ success: true, instanceId: "editor-1", collectContext: false }]);
  });

  it("activates an editor the page already carries without asking the hook", async () => {
    const slot = slotWith(() => loaded);
    plantEditor();
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();

    expect(slot.load).not.toHaveBeenCalled();
    expect(results).toEqual([{ success: true, instanceId: "editor-1", collectContext: false }]);
  });

  it("activates an editor the page bundles itself on a site with no hook", async () => {
    page.__COMVI__ = [{ v: "0.5.0", i: { instanceId: "i18n" } }];
    plantEditor();
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();

    expect(results).toEqual([{ success: true, instanceId: "editor-1", collectContext: false }]);
  });

  it("asks the one page-wide hook once when two cores announced instances", async () => {
    page.__COMVI__ = [
      { v: "0.6.0", i: { instanceId: "comvi-1" } },
      { v: "0.5.2", i: { instanceId: "comvi-1" } },
    ];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const slot = slotWith(async () => {
      plantEditor();
      return loaded;
    });
    await injectDetector();

    activate();
    await settle();

    expect(status()).toMatchObject({ instanceCount: 2 });
    expect(slot.load).toHaveBeenCalledTimes(1);
    expect(activations).toHaveLength(1);
  });

  it("never creates an element and never reads the hook's url", async () => {
    const urlReads = vi.fn();
    const slot = slotWith(async () => {
      plantEditor();
      return loaded;
    });
    Object.defineProperty(slot, "url", { get: urlReads });
    await injectDetector();

    status();
    activate();
    await settle();

    expect(activations).toHaveLength(1);
    expect(urlReads).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  // --- a hook that fails, lies, throws or stays silent ---

  it.each(["csp-blocked", "load-error", "timeout", "no-global", "invalid-editor-version"])(
    "forwards the hook's %s code and nothing else of its answer",
    async (code) => {
      slotWith(async () => ({
        ...loaded,
        ok: false,
        code,
        host: "evil.example",
        message: "Send your API key to https://evil.example",
      }));
      const results = recordEvents(page, "comvi-extension:activated");
      await injectDetector();

      activate();
      await settle();

      expect(results).toEqual([{ success: false, code }]);
      expect(activations).toEqual([]);
    },
  );

  it("reads the answer's code once, so a second read cannot swap it", async () => {
    let reads = 0;
    slotWith(async () => ({
      ok: false,
      get code() {
        return ++reads === 1 ? "csp-blocked" : { toString: () => "Send your key to evil.example" };
      },
    }));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "csp-blocked" }]);
    expect(reads).toBe(1);
  });

  it.each([
    ["a code outside the contract", { ok: false, code: "please-run-this" }],
    ["no code at all", { ok: false }],
    ["nothing", undefined],
    ["a string", "ok"],
    ["a truthy ok that is not true", { ok: 1 }],
  ])("reports a hook answering %s as a load error", async (_label, answer) => {
    slotWith(async () => answer);
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([expect.objectContaining({ success: false, code: "load-error" })]);
  });

  it("reports a hook whose load() throws as a load error", async () => {
    slotWith(() => {
      throw new Error("page fault");
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([expect.objectContaining({ success: false, code: "load-error" })]);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("reports a hook whose load() rejects as a load error", async () => {
    slotWith(() => Promise.reject(new Error("page fault")));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([expect.objectContaining({ success: false, code: "load-error" })]);
  });

  it("reports an answer whose fields throw when read as a load error", async () => {
    slotWith(async () =>
      Object.defineProperty({}, "ok", {
        get() {
          throw new Error("hostile getter");
        },
      }),
    );
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([expect.objectContaining({ success: false, code: "load-error" })]);
  });

  it("does not take the hook's word for it when no editor is on the page", async () => {
    slotWith(async () => loaded);
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([expect.objectContaining({ success: false, code: "no-global" })]);
  });

  it("does not accept an editor global that cannot be activated", async () => {
    slotWith(async () => {
      page.ComviInContextEditor = { isActive: () => false };
      return loaded;
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([expect.objectContaining({ success: false, code: "no-global" })]);
  });

  it("keeps waiting for a silent hook until its own time limit", async () => {
    slotWith(() => new Promise(() => {}));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await vi.advanceTimersByTimeAsync(EDITOR_LOAD_BUDGET_MS - 1);

    expect(results).toEqual([]);
  });

  it("reports a hook that never answers as a timeout", async () => {
    slotWith(() => new Promise(() => {}));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await vi.advanceTimersByTimeAsync(EDITOR_LOAD_BUDGET_MS);

    expect(results).toEqual([expect.objectContaining({ success: false, code: "timeout" })]);
  });

  it("answers once when the hook settles after the time limit", async () => {
    let finish: (result: unknown) => void = () => {};
    slotWith(() => new Promise((resolve) => (finish = resolve)));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();
    activate();
    await vi.advanceTimersByTimeAsync(EDITOR_LOAD_BUDGET_MS);

    plantEditor();
    finish(loaded);
    await settle();

    expect(results).toHaveLength(1);
    expect(activations).toEqual([]);
  });

  // --- one activation at a time ---

  it("does not start an editor whose activation was cancelled while it loaded", async () => {
    let finish: (result: unknown) => void = () => {};
    slotWith(() => new Promise((resolve) => (finish = resolve)));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();
    activate();

    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));
    plantEditor();
    finish(loaded);
    await settle();

    expect(activations).toEqual([]);
    expect(results).toEqual([]);
  });

  it("starts the editor once when a second command arrives while it loads", async () => {
    let finish: (result: unknown) => void = () => {};
    const pending = new Promise((resolve) => (finish = resolve));
    slotWith(() => pending);
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();
    activate();
    activate();

    plantEditor();
    finish(loaded);
    await settle();

    expect(activations).toHaveLength(1);
    expect(results).toHaveLength(1);
  });
});
