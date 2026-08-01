/**
 * Content script running in MAIN world to detect Comvi i18n
 *
 * Runs in the page's JavaScript context (direct access to window.__COMVI__)
 * and is preloaded by the manifest for automatic toolbar detection. The popup
 * may safely re-inject it for an immediate refresh. It talks to the
 * ISOLATED-world bridge via custom events.
 *
 * Security model: this world is shared with arbitrary page scripts, so
 * nothing here ever sees an API key. The editor runtime is activated with a
 * proxy transport that forwards API requests (path + body only) over DOM
 * events to the bridge, which relays them to the service worker where
 * credentials are attached and the target host is enforced.
 */

interface ComviStatus {
  detected: boolean;
  version: string | null;
  instanceCount: number;
  editorActive: boolean;
  editorLoaded: boolean;
}

interface TransportInit {
  method?: string;
  body?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

// --- Discovery protocol v2 (contracts/chrome-extension-proxy.json) ---
//
// New @comvi/core announces instances by pushing `{v, i}` envelopes onto a
// window.__COMVI__ queue array. Per the contract's pageToExtension rules the
// consumer must drain-and-swap: replace the raw array with an
// array-masquerading dual-protocol hook (own push/remove shadow
// Array.prototype, plus the v1 register/unregister/get surface) so cores of
// EITHER version that load later still attach. The hook carries the same
// `__comviEditorHook` marker as the in-context editor's hook, so whichever
// side installs first, the other reuses it instead of swapping again.
//
// v1 legacy registry objects (register fn / instances Map) are left alone —
// the detector keeps its original duck-typed status reads and COMVI_READY
// listener, and the editor's own boot drains them. Truthy non-conforming
// globals are never clobbered.

interface I18nLike {
  instanceId?: string;
}

/** v2 queue entry envelope pushed by new core. */
interface ComviQueueEntry {
  v?: string;
  i: I18nLike;
}

/** Dual-protocol hook installed in place of the raw queue array. */
interface ComviHookLike {
  __comviEditorHook: true;
  version: string | undefined;
  instances: Map<string, I18nLike>;
  push(entry: ComviQueueEntry | I18nLike): void;
  remove(entry: ComviQueueEntry | I18nLike): void;
  register(id: string, instance: I18nLike): void;
  unregister(id: string): void;
  get(id?: string): I18nLike | undefined;
}

let anonCounter = 0;

// The MAIN-world global slot is untyped in this package; every read of it is
// runtime-narrowed before use.
const comviWindow = window as Window & { __COMVI__?: unknown };

function isComviHook(g: unknown): g is ComviHookLike {
  return !!g && typeof g === "object" && "__comviEditorHook" in g && g.__comviEditorHook === true;
}

/**
 * Accept either shape a queue slot may hold: a `{v, i}` envelope (new core)
 * or a bare legacy instance drained from a pre-existing array.
 */
function toInstance(
  entry: ComviQueueEntry | I18nLike,
): { instance: I18nLike; version?: string } | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if ("i" in entry) {
    if (!entry.i || typeof entry.i !== "object") {
      return null;
    }
    return { instance: entry.i, version: typeof entry.v === "string" ? entry.v : undefined };
  }
  return { instance: entry };
}

function createComviHook(): ComviHookLike {
  const instances = new Map<string, I18nLike>();
  const idsByInstance = new Map<I18nLike, string>();

  // Array-masquerading carrier: `Array.isArray(hook)` stays true, but the
  // OWN push/remove assigned below shadow Array.prototype, so new core's
  // Array.isArray-first probe still routes through the hook's push. Matched
  // pair with core's probe order — never drop the masquerade independently.
  const hook = [] as unknown as ComviHookLike;

  const track = (instance: I18nLike, version?: string, id?: string): void => {
    if (!instance || typeof instance !== "object") {
      return;
    }
    const resolvedId =
      id ?? idsByInstance.get(instance) ?? instance.instanceId ?? `comvi-anon-${++anonCounter}`;
    const prevId = idsByInstance.get(instance);
    if (prevId !== undefined && prevId !== resolvedId) {
      instances.delete(prevId);
    }
    instances.set(resolvedId, instance);
    idsByInstance.set(instance, resolvedId);
    if (version !== undefined && hook.version === undefined) {
      hook.version = version;
    }
  };

  const untrack = (instance: I18nLike | undefined): void => {
    if (!instance) {
      return;
    }
    const id = idsByInstance.get(instance);
    if (id !== undefined) {
      idsByInstance.delete(instance);
      instances.delete(id);
    }
  };

  Object.assign(hook, {
    __comviEditorHook: true as const,
    version: undefined as string | undefined,
    instances,
    push(entry: ComviQueueEntry | I18nLike): void {
      const resolved = toInstance(entry);
      if (resolved) {
        track(resolved.instance, resolved.version);
      }
    },
    remove(entry: ComviQueueEntry | I18nLike): void {
      untrack(toInstance(entry)?.instance);
    },
    register(id: string, instance: I18nLike): void {
      track(instance, undefined, id);
    },
    unregister(id: string): void {
      untrack(instances.get(id));
    },
    get(id?: string): I18nLike | undefined {
      if (id) {
        return instances.get(id);
      }
      return instances.values().next().value;
    },
  });

  return hook;
}

/**
 * Drain-and-swap: when window.__COMVI__ is a raw v2 queue array, swap the
 * global to the dual-protocol hook FIRST (so instances constructed mid-boot
 * push into it), then drain the snapshot. Returns the hook when the global
 * is (or just became) hook-shaped; null for everything else — v1 legacy
 * registry objects, truthy garbage, and empty slots are all left untouched.
 */
function adoptComviGlobal(): ComviHookLike | null {
  try {
    const existing: unknown = comviWindow.__COMVI__;
    if (isComviHook(existing)) {
      return existing;
    }
    if (!Array.isArray(existing)) {
      return null;
    }
    const snapshot = existing as Array<ComviQueueEntry | I18nLike>;
    const hook = createComviHook();
    comviWindow.__COMVI__ = hook;
    for (const raw of snapshot) {
      hook.push(raw);
    }
    return hook;
  } catch {
    // Discovery must never break the page.
    return null;
  }
}

const DETECTOR_FLAG = "__comviExtensionDetectorInstalled";

// The popup may inject this script again on every open; run only once per
// page load.
if (!(window as any)[DETECTOR_FLAG]) {
  (window as any)[DETECTOR_FLAG] = true;
  installDetector();
}

function installDetector() {
  let detectionComplete = false;

  function getComviStatus(): ComviStatus {
    // Lazily adopt a raw v2 queue array whenever status is read: new core
    // may install the queue at any point after document_start.
    const hook = adoptComviGlobal();
    const editor = (window as any).ComviInContextEditor;
    const editorActive: boolean = editor?.isActive?.() ?? false;
    const editorLoaded = !!editor;

    if (hook) {
      return {
        detected: hook.instances.size > 0,
        version: hook.version ?? null,
        instanceCount: hook.instances.size,
        editorActive,
        editorLoaded,
      };
    }

    // v1 path, unchanged: legacy registry objects are duck-typed and truthy
    // non-conforming globals are reported but never touched.
    const comvi = (window as any).__COMVI__;
    return {
      detected: !!comvi,
      version: comvi?.version ?? null,
      instanceCount: comvi?.instances?.size ?? 0,
      editorActive,
      editorLoaded,
    };
  }

  function notifyDetected(status: ComviStatus) {
    if (detectionComplete && status.detected) return; // Already notified
    detectionComplete = status.detected;

    window.dispatchEvent(new CustomEvent("comvi-extension:detected", { detail: status }));

    // Respond to Comvi i18n with COMVI_PLUGIN_READY (handshake)
    if (status.detected) {
      window.dispatchEvent(new CustomEvent("COMVI_PLUGIN_READY"));
    }
  }

  function notifyNotFound(status: ComviStatus) {
    window.dispatchEvent(new CustomEvent("comvi-extension:not-found", { detail: status }));
  }

  function notifyActivationFailed(error: unknown) {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", {
        detail: {
          success: false,
          error: error instanceof Error ? error.message : "Failed to activate editor",
        },
      }),
    );
  }

  // --- API proxy transport ---
  // Forwards editor API requests to the bridge over DOM events. Responses
  // are matched by a per-request id. No credentials are involved on this
  // side of the boundary.

  const PROXY_TIMEOUT_MS = 30_000;
  let requestCounter = 0;

  function proxyTransport(path: string, init?: TransportInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      const id = `comvi-${Date.now()}-${++requestCounter}-${Math.random().toString(36).slice(2)}`;
      const signal = init?.signal;

      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }

      const timeout = window.setTimeout(() => {
        dispatchProxyAbort();
        cleanup();
        reject(new TypeError("Comvi extension API request timed out"));
      }, PROXY_TIMEOUT_MS);

      function dispatchProxyAbort() {
        window.dispatchEvent(
          new CustomEvent("comvi-extension:api-abort", { detail: JSON.stringify({ id }) }),
        );
      }

      function onAbort() {
        dispatchProxyAbort();
        cleanup();
        // Tell the service worker to abort the underlying fetch too, so a
        // caller-side timeout doesn't leave the request running for the
        // proxy's own 30s budget.
        reject(new DOMException("The operation was aborted.", "AbortError"));
      }

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("comvi-extension:api-response", onResponse as EventListener);
        signal?.removeEventListener("abort", onAbort);
      }

      function onResponse(event: CustomEvent) {
        let detail: any;
        try {
          detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
        } catch {
          return;
        }
        if (!detail || detail.id !== id) return;

        cleanup();

        if (detail.networkError || typeof detail.status !== "number" || detail.status === 0) {
          reject(new TypeError(detail?.networkError ?? "Comvi extension API request failed"));
          return;
        }

        // Response bodies are forbidden for these status codes.
        const bodyless = detail.status === 204 || detail.status === 205 || detail.status === 304;
        resolve(
          new Response(bodyless ? null : String(detail.body ?? ""), {
            status: detail.status,
            statusText: typeof detail.statusText === "string" ? detail.statusText : "",
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      window.addEventListener("comvi-extension:api-response", onResponse as EventListener);
      signal?.addEventListener("abort", onAbort, { once: true });

      window.dispatchEvent(
        new CustomEvent("comvi-extension:api-request", {
          detail: JSON.stringify({
            id,
            path,
            method: init?.method,
            body: init?.body,
            keepalive: init?.keepalive === true,
          }),
        }),
      );
    });
  }

  // --- Event-based detection (preferred) ---
  // Listen for COMVI_READY event dispatched by @comvi/core when it loads
  window.addEventListener("COMVI_READY", ((event: CustomEvent) => {
    const detail = event.detail || {};
    const status: ComviStatus = {
      detected: true,
      version: typeof detail.version === "string" ? detail.version : null,
      instanceCount: typeof detail.instanceCount === "number" ? detail.instanceCount : 1,
      editorActive: false,
      editorLoaded: !!(window as any).ComviInContextEditor,
    };
    notifyDetected(status);
  }) as EventListener);

  // --- Polling fallback ---
  // For pages where Comvi i18n was loaded before this script
  let pollCount = 0;
  const MAX_POLLS = 30; // 3 seconds max
  const POLL_INTERVAL = 100; // 100ms

  function pollForComvi() {
    const status = getComviStatus();

    if (status.detected) {
      notifyDetected(status);
      return;
    }

    pollCount++;
    if (pollCount < MAX_POLLS) {
      setTimeout(pollForComvi, POLL_INTERVAL);
    } else {
      notifyNotFound(status);
    }
  }

  // --- Extension communication handlers ---

  // Listen for status requests from content script (ISOLATED world)
  window.addEventListener("comvi-extension:get-status", () => {
    const status = getComviStatus();
    window.dispatchEvent(new CustomEvent("comvi-extension:status", { detail: status }));
  });

  // Listen for activate requests. The payload contains only the non-secret
  // base URL for path building; credentials never reach this world.
  window.addEventListener("comvi-extension:activate", ((event: CustomEvent) => {
    let detail: any;
    try {
      detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail || {};
    } catch {
      detail = {};
    }
    const apiBaseUrl = typeof detail.apiBaseUrl === "string" ? detail.apiBaseUrl : undefined;

    const status = getComviStatus();

    if (!status.detected) {
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: { success: false, error: "Comvi i18n not detected" },
        }),
      );
      return;
    }

    // The editor runtime ships inside the extension package and is injected
    // into the page by the popup (chrome.scripting) before this event fires.
    const editor = (window as any).ComviInContextEditor;

    if (!editor) {
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: { success: false, error: "Editor runtime is not loaded" },
        }),
      );
      return;
    }

    try {
      const result = editor.activate({
        transport: proxyTransport,
        apiBaseUrl,
      });
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: {
            success: !!result,
            instanceId: result?.instanceId,
            // Effective value derived by the editor from i18n.collectContext.
            collectContext: result?.collectContext === true,
          },
        }),
      );
    } catch (error) {
      notifyActivationFailed(error);
    }
  }) as EventListener);

  // Listen for deactivate requests
  window.addEventListener("comvi-extension:deactivate", () => {
    const editor = (window as any).ComviInContextEditor;
    if (editor?.isActive?.()) {
      editor.deactivate();
      window.dispatchEvent(
        new CustomEvent("comvi-extension:deactivated", { detail: { success: true } }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("comvi-extension:deactivated", {
          detail: { success: false, error: "Editor not active" },
        }),
      );
    }
  });

  // --- Initialization ---
  // Check immediately (Comvi i18n might already be loaded)
  const initialStatus = getComviStatus();
  if (initialStatus.detected) {
    notifyDetected(initialStatus);
  } else {
    // Start polling as fallback
    pollForComvi();
  }
}

export {};
