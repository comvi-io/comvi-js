/**
 * Content script running in MAIN world to detect Comvi i18n
 *
 * This script runs in the page's JavaScript context, allowing direct access
 * to window.__COMVI__. It communicates with the extension via custom events.
 *
 * Detection uses two methods:
 * 1. Event-based: Listen for COMVI_READY event (preferred, instant detection)
 * 2. Polling fallback: For pages where Comvi i18n was loaded before extension
 */

interface ComviStatus {
  detected: boolean;
  version: string | null;
  instanceCount: number;
  editorActive: boolean;
}

let detectionComplete = false;

function getComviStatus(): ComviStatus {
  const comvi = (window as any).__COMVI__;
  const editor = (window as any).ComviInContextEditor;

  return {
    detected: !!comvi,
    version: comvi?.version ?? null,
    instanceCount: comvi?.instances?.size ?? 0,
    editorActive: editor?.isActive?.() ?? false,
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

// --- Event-based detection (preferred) ---
// Listen for COMVI_READY event dispatched by @comvi/core when it loads
window.addEventListener("COMVI_READY", ((event: CustomEvent) => {
  const detail = event.detail || {};
  const status: ComviStatus = {
    detected: true,
    version: detail.version ?? null,
    instanceCount: detail.instanceCount ?? 1,
    editorActive: false,
  };
  notifyDetected(status);
}) as EventListener);

// --- Polling fallback ---
// For pages where Comvi i18n was loaded before extension content script
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

// Listen for activate requests
window.addEventListener("comvi-extension:activate", ((event: CustomEvent) => {
  const detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail || {};
  const { apiKey, scriptUrl, apiBaseUrl, cdnUrl } = detail;
  const editorScriptUrl = scriptUrl ?? cdnUrl;
  const editorApiBaseUrl = apiBaseUrl ?? cdnUrl;
  const status = getComviStatus();

  if (!status.detected) {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", {
        detail: { success: false, error: "Comvi i18n not detected" },
      }),
    );
    return;
  }

  if (!apiKey) {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", {
        detail: { success: false, error: "API key was not provided to the editor runtime" },
      }),
    );
    return;
  }

  window.dispatchEvent(
    new CustomEvent("comvi-in-context-editor:configure", {
      detail: JSON.stringify({ apiKey, apiBaseUrl: editorApiBaseUrl }),
    }),
  );

  // Check if plugin is already loaded
  const editor = (window as any).ComviInContextEditor;

  if (editor) {
    // Plugin already loaded, just activate
    try {
      const result = editor.activate({ apiKey, cdnUrl: editorApiBaseUrl });
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: { success: !!result, instanceId: result?.instanceId },
        }),
      );
    } catch (error) {
      notifyActivationFailed(error);
    }
    return;
  }

  // Load plugin from CDN
  const script = document.createElement("script");
  script.src = editorScriptUrl;
  script.onload = () => {
    const loadedEditor = (window as any).ComviInContextEditor;
    if (loadedEditor) {
      try {
        const result = loadedEditor.activate({ apiKey, cdnUrl: editorApiBaseUrl });
        window.dispatchEvent(
          new CustomEvent("comvi-extension:activated", {
            detail: { success: !!result, instanceId: result?.instanceId },
          }),
        );
      } catch (error) {
        notifyActivationFailed(error);
      }
    } else {
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activated", {
          detail: { success: false, error: "Plugin failed to initialize" },
        }),
      );
    }
  };
  script.onerror = () => {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:activated", {
        detail: { success: false, error: "Failed to load plugin from CDN" },
      }),
    );
  };
  document.head.appendChild(script);
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
