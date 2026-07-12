/**
 * Content script running in MAIN world to detect Comvi i18n
 *
 * Runs in the page's JavaScript context (direct access to window.__COMVI__)
 * and is injected on demand by the popup via chrome.scripting. It talks to
 * the ISOLATED-world bridge via custom events.
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
    const comvi = (window as any).__COMVI__;
    const editor = (window as any).ComviInContextEditor;

    return {
      detected: !!comvi,
      version: comvi?.version ?? null,
      instanceCount: comvi?.instances?.size ?? 0,
      editorActive: editor?.isActive?.() ?? false,
      editorLoaded: !!editor,
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

  // Listen for activate requests. The payload is non-secret (base URL for
  // path building + telemetry opt-in); credentials never reach this world.
  window.addEventListener("comvi-extension:activate", ((event: CustomEvent) => {
    let detail: any = {};
    try {
      detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail || {};
    } catch {
      detail = {};
    }
    const apiBaseUrl = typeof detail.apiBaseUrl === "string" ? detail.apiBaseUrl : undefined;
    const collectContext = detail.collectContext === true;

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
        collectContext,
      });
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: {
            success: !!result,
            instanceId: result?.instanceId,
            // The page/runtime acknowledgement is untrusted. The service
            // worker may use this boolean only to narrow the popup opt-in.
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
