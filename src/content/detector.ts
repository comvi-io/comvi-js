/**
 * Content script running in MAIN world to detect Tolkie SDK
 *
 * This script runs in the page's JavaScript context, allowing direct access
 * to window.__TOLKIE__. It communicates with the extension via custom events.
 *
 * Detection uses two methods:
 * 1. Event-based: Listen for TOLKIE_READY event (preferred, instant detection)
 * 2. Polling fallback: For pages where SDK was loaded before extension
 */

interface TolkieStatus {
  detected: boolean;
  version: string | null;
  instanceCount: number;
  editorActive: boolean;
}

let detectionComplete = false;

function getTolkieStatus(): TolkieStatus {
  const tolkie = (window as any).__TOLKIE__;
  const editor = (window as any).TolkieInContextEditor;

  return {
    detected: !!tolkie,
    version: tolkie?.version ?? null,
    instanceCount: tolkie?.instances?.size ?? 0,
    editorActive: editor?.isActive?.() ?? false,
  };
}

function notifyDetected(status: TolkieStatus) {
  if (detectionComplete && status.detected) return; // Already notified
  detectionComplete = status.detected;

  window.dispatchEvent(new CustomEvent("tolkie-extension:detected", { detail: status }));

  // Respond to SDK with TOLKIE_PLUGIN_READY (handshake)
  if (status.detected) {
    window.dispatchEvent(new CustomEvent("TOLKIE_PLUGIN_READY"));
  }
}

function notifyNotFound(status: TolkieStatus) {
  window.dispatchEvent(new CustomEvent("tolkie-extension:not-found", { detail: status }));
}

// --- Event-based detection (preferred) ---
// Listen for TOLKIE_READY event dispatched by @tolkie/core when SDK loads
window.addEventListener("TOLKIE_READY", ((event: CustomEvent) => {
  const detail = event.detail || {};
  const status: TolkieStatus = {
    detected: true,
    version: detail.version ?? null,
    instanceCount: detail.instanceCount ?? 1,
    editorActive: false,
  };
  notifyDetected(status);
}) as EventListener);

// --- Polling fallback ---
// For pages where SDK was loaded before extension content script
let pollCount = 0;
const MAX_POLLS = 30; // 3 seconds max
const POLL_INTERVAL = 100; // 100ms

function pollForTolkie() {
  const status = getTolkieStatus();

  if (status.detected) {
    notifyDetected(status);
    return;
  }

  pollCount++;
  if (pollCount < MAX_POLLS) {
    setTimeout(pollForTolkie, POLL_INTERVAL);
  } else {
    notifyNotFound(status);
  }
}

// --- Extension communication handlers ---

// Listen for status requests from content script (ISOLATED world)
window.addEventListener("tolkie-extension:get-status", () => {
  const status = getTolkieStatus();
  window.dispatchEvent(new CustomEvent("tolkie-extension:status", { detail: status }));
});

// Listen for activate requests
window.addEventListener("tolkie-extension:activate", ((event: CustomEvent) => {
  const { apiKey, cdnUrl } = event.detail || {};

  // Check if plugin is already loaded
  const editor = (window as any).TolkieInContextEditor;

  if (editor) {
    // Plugin already loaded, just activate
    const result = editor.activate({ apiKey });
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:activated", {
        detail: { success: !!result, instanceId: result?.instanceId },
      }),
    );
    return;
  }

  // Load plugin from CDN
  const script = document.createElement("script");
  script.src = cdnUrl;
  script.onload = () => {
    const loadedEditor = (window as any).TolkieInContextEditor;
    if (loadedEditor) {
      const result = loadedEditor.activate({ apiKey });
      window.dispatchEvent(
        new CustomEvent("tolkie-extension:activated", {
          detail: { success: !!result, instanceId: result?.instanceId },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("tolkie-extension:activated", {
          detail: { success: false, error: "Plugin failed to initialize" },
        }),
      );
    }
  };
  script.onerror = () => {
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:activated", {
        detail: { success: false, error: "Failed to load plugin from CDN" },
      }),
    );
  };
  document.head.appendChild(script);
}) as EventListener);

// Listen for deactivate requests
window.addEventListener("tolkie-extension:deactivate", () => {
  const editor = (window as any).TolkieInContextEditor;
  if (editor?.isActive?.()) {
    editor.deactivate();
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:deactivated", { detail: { success: true } }),
    );
  } else {
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:deactivated", {
        detail: { success: false, error: "Editor not active" },
      }),
    );
  }
});

// --- Initialization ---
// Check immediately (SDK might already be loaded)
const initialStatus = getTolkieStatus();
if (initialStatus.detected) {
  notifyDetected(initialStatus);
} else {
  // Start polling as fallback
  pollForTolkie();
}
