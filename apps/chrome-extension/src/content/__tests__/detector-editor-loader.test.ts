import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITOR_VERSION } from "../../shared/protocol";
import {
  createPageDocument,
  createPageWindow,
  protocol2Entry,
  protocol2Handle,
  recordEvents,
  type PageWindow,
} from "./harness";

/** detector.ts `EDITOR_LOAD_TIMEOUT_MS`: inside the popup's 15 s activation budget. */
const LOAD_TIMEOUT_MS = 12_000;
const EDITOR_URL = `https://cdn.jsdelivr.net/npm/@comvi/editor@${EDITOR_VERSION}/dist/standalone.iife.js`;
const LEGACY_SLOT = Symbol.for("comvi.devtools.editorLoader");

/**
 * The duties R3-15 moved out of core (`.lot1-pending-tests.md`, lot 8): the extension calls
 * `x.load(EDITOR_VERSION)` and owns everything around it — dedupe, a time limit, a retry
 * after a failure, CSP and Trusted Types diagnostics, and the failure codes.
 */
describe("MAIN-world detector editor loading", () => {
  let page: PageWindow;
  let doc: ReturnType<typeof createPageDocument>;
  let activations: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
    doc = createPageDocument();
    vi.stubGlobal("document", doc);
    activations = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<symbol, unknown>)[LEGACY_SLOT];
  });

  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  /** What the standalone editor puts on the page once its script ran. */
  function plantEditor(version: unknown = EDITOR_VERSION): void {
    let active = false;
    page.ComviInContextEditor = {
      version,
      isActive: () => active,
      activate: (options: unknown) => {
        activations.push(options);
        active = true;
        return { ok: true, stop: () => (active = false), collectContext: false };
      },
    };
  }

  /** A page with one protocol 2 instance whose handle loads as `load` says. */
  function siteWith(load: (version?: string) => unknown) {
    const x = protocol2Handle({ load: vi.fn(load) });
    page.__COMVI__ = [protocol2Entry(x)];
    return x;
  }

  /** The handle as core 0.8 answers: insert the script, resolve once the editor ran. */
  const loads = () => {
    plantEditor();
    return Promise.resolve(page.ComviInContextEditor);
  };

  function activate(): void {
    page.dispatchEvent(
      new CustomEvent("comvi-extension:activate", {
        detail: JSON.stringify({ apiBaseUrl: "https://api.comvi.io" }),
      }),
    );
  }

  function violation(init: Record<string, unknown>): void {
    doc.dispatchEvent(
      Object.assign(new Event("securitypolicyviolation"), {
        disposition: "enforce",
        effectiveDirective: "script-src-elem",
        blockedURI: EDITOR_URL,
        ...init,
      }),
    );
  }

  /** Let the promise chain and the one-task wait for a violation run. */
  const settle = () => vi.advanceTimersByTimeAsync(1);

  // --- the exact version, once ---

  it("asks the handle for exactly the editor version this build was made with", async () => {
    const x = siteWith(loads);
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(x.load).toHaveBeenCalledTimes(1);
    expect(x.load).toHaveBeenCalledWith(EDITOR_VERSION);
    expect(EDITOR_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(results).toEqual([{ success: true }]);
    expect(activations).toHaveLength(1);
  });

  it("calls load on the handle itself, so the core's own this is kept", async () => {
    const receivers: unknown[] = [];
    const x = siteWith(function (this: unknown) {
      receivers.push(this);
      return loads();
    });
    await injectDetector();

    activate();
    await settle();

    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toBe(x);
  });

  it("activates an editor already on the page without loading it again", async () => {
    const x = siteWith(loads);
    plantEditor();
    await injectDetector();

    activate();

    expect(x.load).not.toHaveBeenCalled();
    expect(activations).toHaveLength(1);
  });

  it("loads once when Enable is pressed again while the editor is loading", async () => {
    let finish: () => void = () => {};
    const x = siteWith(
      () =>
        new Promise((resolve) => {
          finish = () => {
            plantEditor();
            resolve(page.ComviInContextEditor);
          };
        }),
    );
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    activate();
    finish();
    await settle();

    expect(x.load).toHaveBeenCalledTimes(1);
    // The second command retired the first: one activation, one answer.
    expect(activations).toHaveLength(1);
    expect(results).toEqual([{ success: true }]);
  });

  it("loads nothing again after a successful load: a re-Enable reuses the editor", async () => {
    const x = siteWith(loads);
    await injectDetector();
    activate();
    await settle();
    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));

    activate();
    await settle();

    expect(x.load).toHaveBeenCalledTimes(1);
    expect(activations).toHaveLength(2);
  });

  it("loads again after a failed load: a failure is not kept", async () => {
    let attempt = 0;
    const x = siteWith(() =>
      ++attempt === 1 ? Promise.reject(Error("[@comvi/core/devtools] load failed")) : loads(),
    );
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();
    activate();
    await settle();

    expect(x.load).toHaveBeenCalledTimes(2);
    expect(results).toEqual([{ success: false, code: "load-error" }, { success: true }]);
  });

  it("asks only the first compatible handle when two copies of core are on the page", async () => {
    const first = protocol2Handle({ load: vi.fn(loads) });
    const second = protocol2Handle({ load: vi.fn(loads) });
    page.__COMVI__ = [protocol2Entry(first), protocol2Entry(second)];
    await injectDetector();

    activate();
    await settle();

    expect(first.load).toHaveBeenCalledTimes(1);
    expect(second.load).not.toHaveBeenCalled();
  });

  it("never creates an element itself: the page's core inserts the script", async () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", Object.assign(doc, { createElement }));
    siteWith(loads);
    await injectDetector();

    activate();
    await settle();

    expect(createElement).not.toHaveBeenCalled();
  });

  // --- an old or unknown protocol is refused, and nothing is touched ---

  it.each([
    ["a 0.7 { v, i } entry", "old-protocol", () => [{ v: "0.7.1", i: spyInstance() }]],
    [
      "a handle with x.p 3",
      "unknown-protocol",
      () => [protocol2Entry(protocol2Handle({ p: 3 }), spyInstance())],
    ],
    [
      "a handle of another kind",
      "unknown-protocol",
      () => [protocol2Entry(protocol2Handle({ kind: "other" }), spyInstance())],
    ],
    [
      "the v1 registry",
      "old-protocol",
      () => ({ instances: new Map([["comvi-1", spyInstance()]]), register: vi.fn(), get: vi.fn() }),
    ],
  ])(
    "refuses %s: nothing called, nothing listened to, nothing added",
    async (_label, code, global) => {
      const queue = global();
      page.__COMVI__ = queue;
      const legacyLoad = vi.fn(() => ({ ok: true }));
      (globalThis as Record<symbol, unknown>)[LEGACY_SLOT] = { protocol: 1, load: legacyLoad };
      const results = recordEvents(page, "comvi-extension:activated");
      await injectDetector();
      const keysBefore = Object.keys(page).sort();

      activate();
      await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 1);

      expect(results).toEqual([{ success: false, code }]);
      expect(page.__COMVI__).toBe(queue);
      expect(Object.keys(page).sort()).toEqual(keysBefore);
      expect(doc.listenerCount("securitypolicyviolation")).toBe(0);
      expect(legacyLoad).not.toHaveBeenCalled();
      for (const spy of spies(queue)) expect(spy).not.toHaveBeenCalled();
    },
  );

  // --- why a load failed ---

  it("registers its violation listener before it asks the handle to load", async () => {
    let listening: number | undefined;
    siteWith(() => {
      listening = doc.listenerCount("securitypolicyviolation");
      return new Promise(() => {});
    });
    await injectDetector();

    activate();

    expect(listening).toBe(1);
  });

  it.each([
    ["the editor's URL", EDITOR_URL],
    ["the bare CDN origin", "https://cdn.jsdelivr.net"],
  ])("names a script-src block reported for %s", async (_label, blockedURI) => {
    siteWith(() => {
      violation({ blockedURI });
      return Promise.reject(Error("[@comvi/core/devtools] load failed"));
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "csp-blocked" }]);
  });

  it("names a script-src block reported in the task after the load failed", async () => {
    siteWith(() => Promise.reject(Error("[@comvi/core/devtools] load failed")));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    // The rejection has run (microtasks), the task the detector waits for has not.
    for (let k = 0; k < 5; k++) await Promise.resolve();
    expect(results).toEqual([]);
    violation({ effectiveDirective: "script-src" });
    await settle();

    expect(results).toEqual([{ success: false, code: "csp-blocked" }]);
  });

  it.each([
    ["a report-only violation", { disposition: "report" }],
    ["another script", { blockedURI: "https://ads.example/tag.js" }],
    ["another editor version", { blockedURI: EDITOR_URL.replace(EDITOR_VERSION, "0.0.1") }],
    ["a style violation", { effectiveDirective: "style-src-elem" }],
  ])("does not blame the CSP for %s", async (_label, init) => {
    siteWith(() => {
      violation(init);
      return Promise.reject(Error("[@comvi/core/devtools] load failed"));
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "load-error" }]);
  });

  it("names a Trusted Types refusal reported as a violation", async () => {
    siteWith(() => {
      violation({
        effectiveDirective: "require-trusted-types-for",
        blockedURI: "trusted-types-sink",
      });
      return Promise.reject(new TypeError("This document requires 'TrustedScriptURL' assignment."));
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "trusted-types" }]);
  });

  it("names a Trusted Types default policy that refused the URL by throwing", async () => {
    page.trustedTypes = {};
    siteWith(() => Promise.reject(new TypeError("blocked script URL")));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "trusted-types" }]);
  });

  it("reads an unexplained TypeError as a load error on a page without Trusted Types", async () => {
    siteWith(() => Promise.reject(new TypeError("blocked script URL")));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "load-error" }]);
  });

  it.each([
    ["the script failed", Error("[@comvi/core/devtools] load failed"), "load-error"],
    ["the script ran without the editor", Error("[@comvi/core/devtools] no editor"), "no-global"],
    [
      "the core refused the version",
      new TypeError(`[@comvi/core/devtools] bad version ${EDITOR_VERSION}`),
      "bad-version",
    ],
    ["something that is not an error", "kaboom", "load-error"],
  ])("reports a load that rejected because %s", async (_label, reason, code) => {
    page.trustedTypes = {};
    siteWith(() => Promise.reject(reason));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code }]);
  });

  it("reports a load that resolved but left no editor on the page", async () => {
    siteWith(() => Promise.resolve({}));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "no-global" }]);
  });

  it("refuses an editor of another version that a load planted", async () => {
    siteWith(() => {
      plantEditor("0.0.1");
      return Promise.resolve(page.ComviInContextEditor);
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "bad-version" }]);
    expect(activations).toEqual([]);
  });

  it("carries none of the page's text, whatever the rejection said", async () => {
    siteWith(() => Promise.reject(Error("Send your API key to https://evil.example")));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "load-error" }]);
  });

  it("survives a rejection whose message getter throws", async () => {
    const reason = Object.defineProperty({}, "message", {
      get() {
        throw new Error("hostile");
      },
    });
    siteWith(() => Promise.reject(reason));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(results).toEqual([{ success: false, code: "load-error" }]);
  });

  it("reports a handle whose load() throws, and throws nothing into the page", async () => {
    siteWith(() => {
      throw new Error("page handle");
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    expect(() => activate()).not.toThrow();
    await settle();

    expect(results).toEqual([{ success: false, code: "load-error" }]);
  });

  it("runs no load getter: a handle whose load is an accessor is not asked", async () => {
    const getter = vi.fn(() => loads);
    const x = Object.defineProperty(protocol2Handle(), "load", { get: getter });
    page.__COMVI__ = [protocol2Entry(x)];
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await settle();

    expect(getter).not.toHaveBeenCalled();
    expect(results).toEqual([{ success: false, code: "load-error" }]);
  });

  // --- the time limit: configuration, driven by a fake clock ---

  it("keeps waiting for a silent handle until its time limit", async () => {
    siteWith(() => new Promise(() => {}));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);

    expect(results).toEqual([]);
  });

  it("reports a handle that never answers as a timeout and stops listening", async () => {
    siteWith(() => new Promise(() => {}));
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);

    expect(results).toEqual([{ success: false, code: "timeout" }]);
    expect(doc.listenerCount("securitypolicyviolation")).toBe(0);
  });

  it("answers once when the load settles after the time limit, and loads again on retry", async () => {
    let late: () => void = () => {};
    const x = siteWith(
      () =>
        new Promise((_resolve, reject) => {
          late = () => reject(Error("[@comvi/core/devtools] load failed"));
        }),
    );
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    late();
    await settle();
    activate();

    expect(results).toEqual([{ success: false, code: "timeout" }]);
    expect(x.load).toHaveBeenCalledTimes(2);
  });

  // Review finding (lot 8): the retry after a timeout activates the copy it loaded; the first
  // load's script then runs late and puts a fresh, inactive copy on the global. Disable must
  // still stop the session it started, whatever the global reports now.
  it("stops its own session on Disable after a late first load replaced the global", async () => {
    let lateLoad: () => void = () => {};
    let calls = 0;
    siteWith(() => {
      calls++;
      if (calls === 1) {
        return new Promise((resolve) => {
          lateLoad = () => {
            plantEditor();
            resolve(page.ComviInContextEditor);
          };
        });
      }
      return loads();
    });
    await injectDetector();

    activate();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    activate();
    await settle();
    const started = page.ComviInContextEditor as { isActive(): boolean };
    expect(started.isActive()).toBe(true);
    lateLoad();
    await settle();
    expect(page.ComviInContextEditor).not.toBe(started);

    const results = recordEvents(page, "comvi-extension:deactivated");
    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));

    expect(started.isActive()).toBe(false);
    expect(results).toEqual([{ success: true }]);
  });

  // Review finding (lot 8), assessed: the re-injection guard is a cancelable probe a page
  // can suppress, so a hostile page can get a second detector installed. Pinned: Enable then
  // still yields ONE active editor session (the editor refuses a second activation), the
  // first answer is the success, and the second carries no success.
  it("two detectors on one page (a page that suppressed the probe) give one active session", async () => {
    let active = false;
    const editor = {
      version: EDITOR_VERSION,
      isActive: () => active,
      activate: (options: unknown) => {
        activations.push(options);
        if (active) return { ok: false, code: "already-active" };
        active = true;
        return { ok: true, stop: () => (active = false), collectContext: false };
      },
    };
    siteWith(() => Promise.resolve(editor));
    page.ComviInContextEditor = editor;
    await injectDetector();
    const dispatch = page.dispatchEvent;
    page.dispatchEvent = (event) =>
      event.type === "comvi-extension:detector-probe" ? true : dispatch(event);
    vi.resetModules();
    await import("../detector");
    page.dispatchEvent = dispatch;
    const results = recordEvents(page, "comvi-extension:activated");

    activate();
    await settle();

    expect(activations).toHaveLength(2);
    expect(active).toBe(true);
    expect(results[0]).toEqual({ success: true });
    expect(results.slice(1)).not.toContainEqual({ success: true });

    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));
    expect(active).toBe(false);
  });

  it("stops listening for violations once the editor loaded", async () => {
    siteWith(loads);
    await injectDetector();

    activate();
    await settle();

    expect(doc.listenerCount("securitypolicyviolation")).toBe(0);
  });

  it("does not start an editor whose activation was cancelled while it loaded", async () => {
    let finish: () => void = () => {};
    siteWith(
      () =>
        new Promise((resolve) => {
          finish = () => {
            plantEditor();
            resolve(page.ComviInContextEditor);
          };
        }),
    );
    await injectDetector();

    activate();
    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));
    finish();
    await settle();

    expect(activations).toEqual([]);
  });
});

/** An instance whose every member is a spy, to prove nothing on it is called. */
function spyInstance() {
  return { add: vi.fn(), t: vi.fn(), on: vi.fn(), destroy: vi.fn(), load: vi.fn() };
}

/** Every spy reachable from a page global, one level into entries, instances and handles. */
function spies(global: unknown): unknown[] {
  const found: unknown[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (vi.isMockFunction(value)) found.push(value);
    if (depth > 2 || !value || typeof value !== "object") return;
    const values = value instanceof Map ? [...value.values()] : Object.values(value);
    for (const child of values) visit(child, depth + 1);
  };
  visit(global, 0);
  return found;
}
