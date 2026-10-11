/**
 * MAIN-world content script: detects Comvi i18n through direct access to
 * window.__COMVI__ and talks to the ISOLATED-world bridge via custom events.
 * The popup may safely re-inject it for an immediate refresh.
 *
 * Security model: this world is shared with arbitrary page scripts, so
 * nothing here ever sees an API key. The editor runtime is activated with a
 * proxy transport that forwards API requests (path + body only) over DOM
 * events to the bridge, which relays them to the service worker where
 * credentials are attached and the target host is enforced.
 *
 * The extension carries no editor. When the page has none, the detector asks
 * the page's own `devtools()` hook to load it (contracts/chrome-extension-proxy.json,
 * `editorLoader`). That hook is page code: it is called under try/catch with a
 * time limit, its answer is read field by field, and the detector never loads
 * the hook's `url` — or any other script — itself.
 */

interface ComviStatus {
  detected: boolean;
  version: string | null;
  instanceCount: number;
  editorActive: boolean;
  editorLoaded: boolean;
  /** The page's editor-loader hook, `null` when there is none. */
  editorLoader: { protocol: number; sdkVersion?: string; editorVersion?: string } | null;
  /** Version the loaded editor reports, `null` when unknown. */
  editorVersion: string | null;
}

/** The slice of the page's editor-loader hook this script uses. */
interface EditorLoaderSlot {
  protocol: number;
  sdkVersion?: unknown;
  editorVersion?: unknown;
  load(): unknown;
}

/** Why the editor is not on the page; `code` is from the contract's list, or `no-loader`. */
interface EditorLoadFailure {
  code: "csp-blocked" | "load-error" | "timeout" | "no-global" | "no-loader";
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
// v1 legacy registry objects (register fn / instances Map) are left alone, and
// truthy non-conforming globals are never clobbered.

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
let dedupeCounter = 0;

// The MAIN-world global slot is untyped in this package; every read of it is
// runtime-narrowed before use.
const comviWindow = window as Window & { __COMVI__?: unknown };

/**
 * The marker alone is NOT enough: it is forgeable, and a page that pollutes
 * `Object.prototype.__comviEditorHook` marks every object. Adopt only a global
 * that also carries every member a consumer of this protocol then USES on it —
 * the `push`/`remove` pair core requires before pushing (`core/devtools.ts`),
 * the `instances` map the status probe reads, and `get`, which the editor
 * runtime calls to resolve the instance to edit. A marked-but-non-conforming
 * global is a truthy non-conforming global: left untouched, never adopted,
 * never read.
 */
function isComviHook(g: unknown): g is ComviHookLike {
  if (!g || typeof g !== "object") {
    return false;
  }
  const h = g as Partial<ComviHookLike>;
  return (
    h.__comviEditorHook === true &&
    h.instances instanceof Map &&
    typeof h.push === "function" &&
    typeof h.remove === "function" &&
    typeof h.get === "function"
  );
}

/**
 * Accept either shape a queue slot may hold: a `{v, i}` envelope (new core)
 * or a bare legacy instance drained from a pre-existing array. `i` is read as
 * an OWN property: `in` walks the prototype chain, so a page with a polluted
 * `Object.prototype.i` would otherwise have every bare instance read as an
 * envelope and its own object tracked as the i18n instance.
 */
function toInstance(
  entry: ComviQueueEntry | I18nLike,
): { instance: I18nLike; version?: string } | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(entry, "i")) {
    const envelope = entry as ComviQueueEntry;
    if (!envelope.i || typeof envelope.i !== "object") {
      return null;
    }
    return {
      instance: envelope.i,
      version: typeof envelope.v === "string" ? envelope.v : undefined,
    };
  }
  return { instance: entry as I18nLike };
}

function createComviHook(): ComviHookLike {
  const instances = new Map<string, I18nLike>();
  const idsByInstance = new Map<I18nLike, string>();
  // Ids an old core CLAIMED through `register(id, instance)`, kept apart from
  // the live map: when the claim collided it was tracked under a deduped key,
  // and `unregister(id)` must still reach the instance that asked for the id
  // rather than whichever instance happens to hold it now.
  const claimedIds = new Map<string, I18nLike>();

  const forgetClaims = (instance: I18nLike): void => {
    claimedIds.forEach((held, claimed) => {
      if (held === instance) claimedIds.delete(claimed);
    });
  };

  // Array-masquerading carrier: `Array.isArray(hook)` stays true, but the
  // OWN push/remove assigned below shadow Array.prototype, so new core's
  // Array.isArray-first probe still routes through the hook's push. Matched
  // pair with core's probe order — never drop the masquerade independently.
  const hook = [] as unknown as ComviHookLike;

  const track = (instance: I18nLike, version?: string, id?: string): void => {
    if (!instance || typeof instance !== "object") {
      return;
    }
    let resolvedId =
      id ?? idsByInstance.get(instance) ?? instance.instanceId ?? `comvi-anon-${++anonCounter}`;
    if (id !== undefined) {
      // One instance holds at most one claimed id: a re-register moves it.
      forgetClaims(instance);
      claimedIds.set(id, instance);
    }
    // Two copies of core on one page both mint `comvi-1`. Keying on the id
    // alone would drop the first instance from discovery the moment the second
    // announced itself, so a colliding id is DEDUPED rather than overwritten:
    // both instances stay discoverable. The suffix is always appended to the
    // ORIGINAL id, never to an already-suffixed one.
    if (instances.has(resolvedId) && instances.get(resolvedId) !== instance) {
      const claimed = resolvedId;
      do {
        resolvedId = `${claimed}#${++dedupeCounter}`;
      } while (instances.has(resolvedId) && instances.get(resolvedId) !== instance);
      console.warn(
        `[ComviExtension] Two i18n instances announced the same instanceId "${claimed}"; tracking the second as "${resolvedId}". Two copies of @comvi/core on one page is the usual cause.`,
      );
    }
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
    if (id === undefined) {
      return;
    }
    idsByInstance.delete(instance);
    forgetClaims(instance);
    // Identity guard: only drop the slot while it still holds THIS instance.
    // Without it, a destroyed instance whose id was taken over by another live
    // one evicts that live one from discovery.
    if (instances.get(id) === instance) {
      instances.delete(id);
    }
  };

  /**
   * The instance a deduped id now lives under, when that is unambiguous: an
   * `instanceId` is public (the popup shows it, the editor is activated with
   * it), so an instance tracked as `<id>#<n>` must still be addressable by the
   * id it announced once nothing holds the exact key. Two candidates mean the
   * caller has to name the deduped key itself.
   */
  const resolveDeduped = (id: string): I18nLike | undefined => {
    const prefix = `${id}#`;
    let found: I18nLike | undefined;
    for (const [key, instance] of instances) {
      if (key.startsWith(prefix)) {
        if (found) return undefined;
        found = instance;
      }
    }
    return found;
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
      untrack(claimedIds.get(id) ?? instances.get(id));
    },
    get(id?: string): I18nLike | undefined {
      if (id) {
        return instances.get(id) ?? resolveDeduped(id);
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
    // `Array.isArray` is probed BEFORE the marker, matching core's probe order:
    // a page that pollutes `Object.prototype.__comviEditorHook` must not be
    // able to make a legitimate raw queue array look like an installed hook.
    if (Array.isArray(existing)) {
      // An array-masquerading hook (ours, or the in-context editor's) is
      // already the drained-and-swapped global: reuse it, never swap twice.
      if (isComviHook(existing)) {
        return existing;
      }
      const snapshot = existing as Array<ComviQueueEntry | I18nLike>;
      const hook = createComviHook();
      comviWindow.__COMVI__ = hook;
      for (const raw of snapshot) {
        hook.push(raw);
      }
      return hook;
    }
    return isComviHook(existing) ? existing : null;
  } catch {
    // Discovery must never break the page.
    return null;
  }
}

const EDITOR_LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");
const LOAD_FAILURE_CODES = ["csp-blocked", "load-error", "timeout", "no-global"] as const;
// The hook gives up after 10 s on its own. This bounds a hook that never
// answers, inside the popup's 15 s activation budget.
const EDITOR_LOAD_BUDGET_MS = 12_000;

/** The page's editor runtime, when it is one: an object with `activate()`. */
function pageEditor(): any {
  const editor = (window as any).ComviInContextEditor;
  return editor && typeof editor.activate === "function" ? editor : undefined;
}

/**
 * The hook `devtools()` installed, or null. Never throws: the slot is
 * page-controlled, so a getter that throws reads as "no hook".
 */
function readEditorLoader(): EditorLoaderSlot | null {
  try {
    const slot = (globalThis as any)[EDITOR_LOADER_KEY];
    if (!slot || typeof slot !== "object" || typeof slot.load !== "function") {
      return null;
    }
    return Number.isInteger(slot.protocol) && slot.protocol >= 1 ? slot : null;
  } catch {
    return null;
  }
}

function describeEditorLoader(): ComviStatus["editorLoader"] {
  const slot = readEditorLoader();
  if (!slot) {
    return null;
  }
  try {
    return {
      protocol: slot.protocol,
      sdkVersion: typeof slot.sdkVersion === "string" ? slot.sdkVersion : undefined,
      editorVersion: typeof slot.editorVersion === "string" ? slot.editorVersion : undefined,
    };
  } catch {
    return null;
  }
}

function loadFailure(code: EditorLoadFailure["code"]): EditorLoadFailure {
  return { code };
}

/** Turn the hook's page-authored answer into a failure, or null when the editor is there. */
function readLoadResult(result: unknown): EditorLoadFailure | null {
  try {
    const raw = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
    if (raw.ok === true) {
      // The hook's word is not enough: activation needs the runtime itself.
      return pageEditor() ? null : loadFailure("no-global");
    }
    // Read once, then judge: a getter may answer differently the next time.
    // Nothing else of the answer is used; its host and message stay behind.
    const reported = raw.code;
    return loadFailure(LOAD_FAILURE_CODES.find((known) => known === reported) ?? "load-error");
  } catch {
    return loadFailure("load-error");
  }
}

/**
 * Ask the page's hook for the editor. Resolves null once the editor is on the
 * page, otherwise the reason. Never rejects and always settles: a hook that
 * throws, rejects or stays silent is a page fault with its own code.
 */
function requestEditor(slot: EditorLoaderSlot): Promise<EditorLoadFailure | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(loadFailure("timeout")), EDITOR_LOAD_BUDGET_MS);
    const settle = (outcome: EditorLoadFailure | null): void => {
      window.clearTimeout(timer);
      resolve(outcome);
    };
    try {
      Promise.resolve(slot.load()).then(
        (result) => settle(readLoadResult(result)),
        () => settle(loadFailure("load-error")),
      );
    } catch {
      settle(loadFailure("load-error"));
    }
  });
}

const DETECTOR_FLAG = "__comviExtensionDetectorInstalled";

// The popup may inject this script again on every open; run only once per
// page load.
if (!(window as any)[DETECTOR_FLAG]) {
  (window as any)[DETECTOR_FLAG] = true;
  try {
    installDetector();
  } catch (error) {
    // The flag is a re-injection guard, not a receipt. If installation could
    // not finish, clear it so the popup's next chrome.scripting injection
    // retries instead of being a permanent no-op for this page load.
    (window as any)[DETECTOR_FLAG] = false;
    throw error;
  }
}

function installDetector() {
  let detectionComplete = false;

  /**
   * Never throws: every read below touches page-controlled objects, and a
   * getter that throws must not be able to silence the detector — the bridge
   * and the popup get "nothing detected" rather than no answer at all.
   */
  function getComviStatus(): ComviStatus {
    try {
      return readComviStatus();
    } catch {
      return {
        detected: false,
        version: null,
        instanceCount: 0,
        editorActive: false,
        editorLoaded: false,
        editorLoader: null,
        editorVersion: null,
      };
    }
  }

  function readComviStatus(): ComviStatus {
    // Lazily adopt a raw v2 queue array whenever status is read: new core
    // may install the queue at any point after document_start.
    const hook = adoptComviGlobal();
    const editor = (window as any).ComviInContextEditor;
    const editorActive: boolean = editor?.isActive?.() ?? false;
    const editorLoaded = !!pageEditor();
    const editorLoader = describeEditorLoader();
    const editorVersion = typeof editor?.version === "string" ? editor.version : null;

    if (hook) {
      return {
        detected: hook.instances.size > 0,
        version: hook.version ?? null,
        instanceCount: hook.instances.size,
        editorActive,
        editorLoaded,
        editorLoader,
        editorVersion,
      };
    }

    // v1 path: legacy registry objects are duck-typed, and truthy
    // non-conforming globals are reported but never touched. A global we
    // refused to adopt lands HERE, not on `not-found`: it is reported the way
    // any other truthy foreign value is (`detected: true` with whatever
    // `instances.size` it happens to expose, usually 0), and activation then
    // answers with a failure. `not-found` is for an empty slot, or for reads
    // that throw, which `getComviStatus` turns into nothing-detected.
    const comvi = (window as any).__COMVI__;
    return {
      detected: !!comvi,
      version: comvi?.version ?? null,
      instanceCount: comvi?.instances?.size ?? 0,
      editorActive,
      editorLoaded,
      editorLoader,
      editorVersion,
    };
  }

  function notifyDetected(status: ComviStatus) {
    if (detectionComplete && status.detected) return;
    detectionComplete = status.detected;

    window.dispatchEvent(new CustomEvent("comvi-extension:detected", { detail: status }));

    // The handshake half Comvi i18n waits for.
    if (status.detected) {
      window.dispatchEvent(new CustomEvent("COMVI_PLUGIN_READY"));
    }
  }

  function notifyNotFound(status: ComviStatus) {
    window.dispatchEvent(new CustomEvent("comvi-extension:not-found", { detail: status }));
  }

  // What the editor threw is page-authored text: it goes nowhere.
  function notifyActivationFailed() {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", { detail: { success: false } }),
    );
  }

  // --- API proxy transport ---
  // Forwards editor API requests to the bridge over DOM events, matched by a
  // per-request id. No credentials are involved on this side of the boundary.

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

  window.addEventListener("COMVI_READY", ((event: CustomEvent) => {
    const detail = event.detail || {};
    const status: ComviStatus = {
      detected: true,
      version: typeof detail.version === "string" ? detail.version : null,
      instanceCount: typeof detail.instanceCount === "number" ? detail.instanceCount : 1,
      editorActive: false,
      editorLoaded: !!pageEditor(),
      editorLoader: describeEditorLoader(),
      editorVersion: null,
    };
    notifyDetected(status);
  }) as EventListener);

  // Polling fallback, for pages where Comvi i18n loaded before this script.
  let pollCount = 0;
  const MAX_POLLS = 30;
  const POLL_INTERVAL = 100;

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

  // Status requests come from the ISOLATED-world bridge.
  window.addEventListener("comvi-extension:get-status", () => {
    const status = getComviStatus();
    window.dispatchEvent(new CustomEvent("comvi-extension:status", { detail: status }));
  });

  function activateEditor(apiBaseUrl: string | undefined) {
    try {
      const result = pageEditor().activate({
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
    } catch {
      notifyActivationFailed();
    }
  }

  // One activation is in flight at a time: a newer command, or a deactivation,
  // retires an older one that is still waiting for the editor to load.
  let activationAttempt = 0;

  // The activate payload carries only the non-secret base URL for path
  // building; credentials never reach this world.
  window.addEventListener("comvi-extension:activate", ((event: CustomEvent) => {
    const attempt = ++activationAttempt;
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
          detail: { success: false },
        }),
      );
      return;
    }

    // A page that already carries the editor (its app bundles it, or an
    // earlier activation loaded it) needs no load.
    if (pageEditor()) {
      activateEditor(apiBaseUrl);
      return;
    }

    const reportLoadFailure = (failure: EditorLoadFailure) => {
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", { detail: { success: false, ...failure } }),
      );
    };

    const slot = readEditorLoader();
    if (!slot) {
      reportLoadFailure(loadFailure("no-loader"));
      return;
    }

    void requestEditor(slot).then((failure) => {
      if (attempt !== activationAttempt) return;
      if (failure) {
        reportLoadFailure(failure);
      } else {
        activateEditor(apiBaseUrl);
      }
    });
  }) as EventListener);

  window.addEventListener("comvi-extension:deactivate", () => {
    activationAttempt++;
    const editor = (window as any).ComviInContextEditor;
    if (editor?.isActive?.()) {
      editor.deactivate();
      window.dispatchEvent(
        new CustomEvent("comvi-extension:deactivated", { detail: { success: true } }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("comvi-extension:deactivated", {
          detail: { success: false },
        }),
      );
    }
  });

  const initialStatus = getComviStatus();
  if (initialStatus.detected) {
    notifyDetected(initialStatus);
  } else {
    pollForComvi();
  }
}

export {};
