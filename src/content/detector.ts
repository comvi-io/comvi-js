/**
 * Content script running in MAIN world to detect Tolkie SDK
 *
 * This script runs in the page's JavaScript context, allowing direct access
 * to window.__TOLKIE__. It communicates with the extension via custom events.
 */

interface TolkieStatus {
  detected: boolean;
  version: string | null;
  instanceCount: number;
  editorActive: boolean;
}

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

// Listen for status requests from content script (ISOLATED world)
window.addEventListener("tolkie-extension:get-status", () => {
  const status = getTolkieStatus();
  window.dispatchEvent(
    new CustomEvent("tolkie-extension:status", { detail: status })
  );
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
      })
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
        })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("tolkie-extension:activated", {
          detail: { success: false, error: "Plugin failed to initialize" },
        })
      );
    }
  };
  script.onerror = () => {
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:activated", {
        detail: { success: false, error: "Failed to load plugin from CDN" },
      })
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
      new CustomEvent("tolkie-extension:deactivated", { detail: { success: true } })
    );
  } else {
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:deactivated", {
        detail: { success: false, error: "Editor not active" },
      })
    );
  }
});

// Poll for Tolkie SDK and notify extension when found
let pollCount = 0;
const MAX_POLLS = 50; // 5 seconds max

function pollForTolkie() {
  const status = getTolkieStatus();

  if (status.detected) {
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:detected", { detail: status })
    );
    return;
  }

  pollCount++;
  if (pollCount < MAX_POLLS) {
    setTimeout(pollForTolkie, 100);
  } else {
    window.dispatchEvent(
      new CustomEvent("tolkie-extension:not-found", { detail: status })
    );
  }
}

// Start polling when script loads
pollForTolkie();
