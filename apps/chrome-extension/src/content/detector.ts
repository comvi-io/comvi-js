/**
 * MAIN-world content script: finds Comvi i18n through `window.__COMVI__` (protocol 2,
 * contracts/chrome-extension-proxy.json `discovery` + `handle`) and talks to the
 * ISOLATED-world bridge over custom events. The popup may safely re-inject it.
 *
 * Security model: this world is shared with arbitrary page scripts, so nothing here ever
 * sees an API key. The editor is activated with a proxy transport that forwards API
 * requests (path + body only) over DOM events to the bridge, which relays them to the
 * service worker where credentials are attached and the target host is enforced.
 *
 * Everything on `window.__COMVI__` is page-controlled. A status read only reads: it never
 * replaces or changes the global, never calls anything on an entry, and reads every value
 * as an own data property inside try/catch. Only an entry with an own `i` object and an own
 * `x` object with `x.p === 2 && x.kind === "comvi"` is driven; on a page with anything else
 * the detector reports what it found and does nothing.
 *
 * The extension carries no editor. On Enable the detector asks a compatible handle to load
 * the one editor version this build works with, `x.load(EDITOR_VERSION)`; the core of the
 * page adds the script. Everything around that call is the extension's (R3-15): one load in
 * flight, a time limit, a retry after a failure, and the reason when it fails.
 */
import { EDITOR_VERSION, HANDLE_KIND, HANDLE_PROTOCOL, QUEUE_GLOBAL } from "../shared/protocol";

/** What the entries on the page speak; mirrors `PageSupport` in shared/messages.ts. */
type Support = "compatible" | "old-protocol" | "unknown-protocol";

interface ComviStatus {
  /** Some Comvi announced itself, whatever protocol it speaks. */
  detected: boolean;
  /** `null` when nothing was detected. */
  support: Support | null;
  /** Page text (`v` of an entry): the popup shows it only when it looks like a version. */
  version: string | null;
  /** Compatible instances, deduped by `i`. */
  instanceCount: number;
  editorActive: boolean;
  /** Version the loaded editor reports, `null` when unknown. */
  editorVersion: string | null;
}

/**
 * Why the editor could not be put on the page or started (shared/messages.ts
 * `ActivationFailureCode`). Decided here; no page text travels with it.
 */
type Failure =
  | "csp-blocked"
  | "trusted-types"
  | "load-error"
  | "timeout"
  | "no-global"
  | "bad-version"
  | "old-protocol"
  | "unknown-protocol"
  | "no-instance";

interface TransportInit {
  method?: string;
  body?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

/** The editor's global as this detector uses it. */
interface EditorGlobal {
  activate(options: unknown): unknown;
  deactivate?: () => void;
  isActive?: () => boolean;
  version?: unknown;
}

// The handle's `x.load()` rejects after its script failed, ran without leaving the editor,
// or for a version that is not one (packages/core/src/devtools.ts).
const CORE_LOAD_FAILED = "[@comvi/core/devtools] load failed";
const CORE_NO_EDITOR = "[@comvi/core/devtools] no editor";
const CORE_BAD_VERSION = "[@comvi/core/devtools] bad version";

// Inside the popup's 15 s activation budget.
const EDITOR_LOAD_TIMEOUT_MS = 12_000;

/** Codes the editor's `activate()` returns that the popup words on its own. */
const EDITOR_FAILURES: readonly Failure[] = ["old-protocol", "unknown-protocol", "no-instance"];

const own = (o: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, key);
const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

/**
 * An own DATA property's value, without running a getter. Undefined for an accessor or a
 * missing property; a Proxy's trap may still throw, so every caller is under try/catch.
 */
function ownValue(o: object, key: PropertyKey): unknown {
  return Object.getOwnPropertyDescriptor(o, key)?.value;
}

interface Discovery {
  support: Support | null;
  version: string | null;
  /** The first compatible handle: the one asked to load the editor. */
  handle: object | null;
  instanceCount: number;
}

const NOTHING: Discovery = { support: null, version: null, handle: null, instanceCount: 0 };

/**
 * Judges `window.__COMVI__` without changing it and without calling anything on it.
 * Never throws: a global or an entry whose reads throw counts as no entry.
 */
function discover(): Discovery {
  let g: unknown;
  try {
    g = ownValue(window, QUEUE_GLOBAL);
  } catch {
    return NOTHING;
  }
  try {
    if (!Array.isArray(g)) {
      // The v1 registry of 0.4–0.5.
      return isObject(g) && (own(g, "register") || own(g, "instances"))
        ? { ...NOTHING, support: "old-protocol" }
        : NOTHING;
    }
    // The 0.7 editor's and extension's hook: an array carrying its own marker.
    if (own(g, "__comviEditorHook")) return { ...NOTHING, support: "old-protocol" };
  } catch {
    return NOTHING;
  }

  let length = 0;
  try {
    const raw = ownValue(g, "length");
    length = typeof raw === "number" ? raw : 0;
  } catch {
    /* treated as empty */
  }
  const instances = new Set<object>();
  let handle: object | null = null;
  let version: string | null = null;
  let firstVersion: string | null = null;
  let old = false;
  let unknown = false;
  for (let k = 0; k < length; k++) {
    try {
      const entry = ownValue(g, k);
      if (!isObject(entry)) continue;
      const v = ownValue(entry, "v");
      if (firstVersion === null && typeof v === "string") firstVersion = v;
      const i = ownValue(entry, "i");
      if (!own(entry, "x")) {
        if (isObject(i)) old = true;
        continue;
      }
      const x = ownValue(entry, "x");
      if (
        !isObject(x) ||
        ownValue(x, "p") !== HANDLE_PROTOCOL ||
        ownValue(x, "kind") !== HANDLE_KIND ||
        !isObject(i)
      ) {
        unknown = true;
        continue;
      }
      instances.add(i);
      if (!handle) {
        handle = x;
        version = typeof v === "string" ? v : null;
      }
    } catch {
      /* an entry whose reads throw is no entry */
    }
  }
  if (handle) return { support: "compatible", version, handle, instanceCount: instances.size };
  if (unknown) return { ...NOTHING, support: "unknown-protocol", version: firstVersion };
  if (old) return { ...NOTHING, support: "old-protocol", version: firstVersion };
  return NOTHING;
}

/** The editor's global when it is one: an object with `activate()`. Never throws. */
function pageEditor(): EditorGlobal | undefined {
  try {
    const editor = ownValue(window, "ComviInContextEditor");
    return isObject(editor) && typeof ownValue(editor, "activate") === "function"
      ? (editor as EditorGlobal)
      : undefined;
  } catch {
    return undefined;
  }
}

function editorVersionOf(editor: EditorGlobal | undefined): string | null {
  try {
    const version = editor ? ownValue(editor, "version") : undefined;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/** A blocked URL that is the editor's script, or the bare origin a report may carry instead. */
function isEditorScript(uri: unknown): boolean {
  return (
    typeof uri === "string" &&
    (uri.includes(`/@comvi/editor@${EDITOR_VERSION}/`) || /^https?:\/\/[^/]+\/?$/.test(uri))
  );
}

/** The reason a rejected `x.load()` gave, judged on its message only. Never throws. */
function rejectionFailure(reason: unknown): Failure {
  let message: string;
  let typeError: boolean;
  try {
    typeError = reason instanceof TypeError;
    const raw = isObject(reason) ? (reason as { message?: unknown }).message : undefined;
    message = typeof raw === "string" ? raw : "";
  } catch {
    return "load-error";
  }
  if (message.startsWith(CORE_NO_EDITOR)) return "no-global";
  if (message.startsWith(CORE_BAD_VERSION)) return "bad-version";
  if (message.startsWith(CORE_LOAD_FAILED)) return "load-error";
  // Anything else thrown while the core assigned the script's `src`: on a page with Trusted
  // Types, a default policy that refused the URL by throwing (a refusal without a policy is
  // reported as a violation instead).
  return typeError && "trustedTypes" in window ? "trusted-types" : "load-error";
}

/**
 * Asks the handle for the editor. Resolves `null` once the editor is on the page, otherwise
 * with the reason. Never rejects and always settles. The violation listener is registered
 * BEFORE `x.load()`: the core inserts the script synchronously.
 */
function loadEditor(handle: object): Promise<Failure | null> {
  return new Promise((resolve) => {
    let violation: Failure | null = null;
    let done = false;
    const onViolation = (event: Event): void => {
      try {
        const e = event as SecurityPolicyViolationEvent;
        if (e.disposition === "report") return;
        const directive = String(e.effectiveDirective || e.violatedDirective || "");
        if (directive === "require-trusted-types-for" || directive === "trusted-types") {
          violation ??= "trusted-types";
        } else if (/^script-src(-elem)?$/.test(directive) && isEditorScript(e.blockedURI)) {
          violation ??= "csp-blocked";
        }
      } catch {
        /* a forged event */
      }
    };
    const finish = (failure: Failure | null): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      document.removeEventListener("securitypolicyviolation", onViolation);
      resolve(failure);
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    const timer = window.setTimeout(() => finish("timeout"), EDITOR_LOAD_TIMEOUT_MS);
    // A violation is reported in a task of its own; let one for this load arrive first.
    const failed = (failure: Failure): void => {
      window.setTimeout(() => finish(violation ?? failure), 0);
    };
    try {
      const load = ownValue(handle, "load");
      if (typeof load !== "function") {
        failed("load-error");
        return;
      }
      Promise.resolve(load.call(handle, EDITOR_VERSION)).then(
        () => finish(pageEditor() ? null : "no-global"),
        (reason: unknown) => failed(rejectionFailure(reason)),
      );
    } catch (error) {
      // Protocol 2's load() never throws; a page's handle may.
      failed(rejectionFailure(error));
    }
  });
}

// Re-injection guard. The popup may inject this script again; it must install once per
// page load. An installed detector answers the probe by cancelling it, so nothing is left on
// `window` for the page to see (a property would be one more global on every site).
const PROBE = "comvi-extension:detector-probe";

if (window.dispatchEvent(new CustomEvent(PROBE, { cancelable: true }))) {
  installDetector();
  // Last: an installation that threw answers no probe, so the next injection retries.
  window.addEventListener(PROBE, (event) => event.preventDefault());
}

function installDetector() {
  let detectionComplete = false;
  /** Set by our own activation, cleared by deactivation and the editor's lifecycle event. */
  let editorActive = false;
  /** The active session's own `stop()`, from the editor's activation result. */
  let stopSession: (() => void) | null = null;
  /** The one editor load in flight, shared by every Enable until it settles. */
  let loading: Promise<Failure | null> | null = null;

  function getComviStatus(): ComviStatus {
    const found = discover();
    return {
      detected: found.support !== null,
      support: found.support,
      version: found.version,
      instanceCount: found.instanceCount,
      editorActive,
      editorVersion: editorVersionOf(pageEditor()),
    };
  }

  function notifyDetected(status: ComviStatus) {
    if (detectionComplete && status.detected) return;
    detectionComplete = status.detected;
    window.dispatchEvent(new CustomEvent("comvi-extension:detected", { detail: status }));
  }

  function notifyNotFound(status: ComviStatus) {
    window.dispatchEvent(new CustomEvent("comvi-extension:not-found", { detail: status }));
  }

  // What the editor threw or returned as text is page-authored: it goes nowhere.
  function reportFailure(code?: Failure) {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", {
        detail: code ? { success: false, code } : { success: false },
      }),
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

  // Polling fallback, for pages whose Comvi i18n starts after this script.
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

  // The editor ends its session on its own too (the page called deactivate()): the event is
  // page-forgeable, so it may only clear what this detector believes, never start anything.
  window.addEventListener("comvi-in-context-editor:lifecycle", ((event: CustomEvent) => {
    try {
      if (isObject(event.detail) && ownValue(event.detail, "state") === "deactivated") {
        editorActive = false;
        stopSession = null;
      }
    } catch {
      /* a forged event */
    }
  }) as EventListener);

  function startEditor(editor: EditorGlobal, apiBaseUrl: string | undefined) {
    // The one version this build was made with; anything else may speak another API.
    if (editorVersionOf(editor) !== EDITOR_VERSION) {
      reportFailure("bad-version");
      return;
    }
    let ok: unknown;
    let code: unknown;
    let stop: unknown;
    try {
      const result: unknown = editor.activate({ transport: proxyTransport, apiBaseUrl });
      // Each field read once: the editor's global is page-reachable.
      if (isObject(result)) {
        ok = ownValue(result, "ok");
        code = ownValue(result, "code");
        stop = ownValue(result, "stop");
      }
    } catch {
      reportFailure();
      return;
    }
    if (ok !== true) {
      reportFailure(EDITOR_FAILURES.find((known) => known === code));
      return;
    }
    editorActive = true;
    stopSession = typeof stop === "function" ? (stop as () => void) : null;
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", { detail: { success: true } }),
    );
  }

  /** One load in flight: a repeated Enable waits for it; a failed one may be retried. */
  function ensureEditor(handle: object): Promise<Failure | null> {
    loading ??= loadEditor(handle).finally(() => {
      loading = null;
    });
    return loading;
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
    const apiBaseUrl = typeof detail?.apiBaseUrl === "string" ? detail.apiBaseUrl : undefined;

    // An old or unknown protocol is refused here: nothing is loaded or called.
    const found = discover();
    if (!found.handle) {
      reportFailure(
        found.support === "compatible" ? "no-instance" : (found.support ?? "no-instance"),
      );
      return;
    }

    // An editor already on the page (an earlier Enable loaded it) needs no load.
    const editor = pageEditor();
    if (editor) {
      startEditor(editor, apiBaseUrl);
      return;
    }

    void ensureEditor(found.handle).then((failure) => {
      if (attempt !== activationAttempt) return;
      const loaded = pageEditor();
      if (failure || !loaded) reportFailure(failure ?? "no-global");
      else startEditor(loaded, apiBaseUrl);
    });
  }) as EventListener);

  window.addEventListener("comvi-extension:deactivate", () => {
    activationAttempt++;
    const editor = pageEditor();
    let stopped = false;
    try {
      if (editor?.isActive?.() === true) {
        if (stopSession) stopSession();
        else editor.deactivate?.();
        stopped = true;
      }
    } catch {
      /* the page's editor */
    }
    stopSession = null;
    editorActive = false;
    window.dispatchEvent(
      new CustomEvent("comvi-extension:deactivated", { detail: { success: stopped } }),
    );
  });

  const initialStatus = getComviStatus();
  if (initialStatus.detected) {
    notifyDetected(initialStatus);
  } else {
    pollForComvi();
  }
}

export {};
