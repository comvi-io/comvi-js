/**
 * ISOLATED-world content script bridging the page (MAIN world) and the
 * extension (background/popup). Preloaded by the manifest and safely
 * re-injectable by the popup for an immediate status refresh.
 *
 * Trust model: every CustomEvent arriving here originates in the MAIN world
 * and can be forged by page scripts. All payloads are sanitized before being
 * forwarded, and nothing secret ever crosses this boundary in either
 * direction — authenticated API requests are proxied to the service worker,
 * which holds the credentials and enforces origin/path allowlists.
 */

import type { Message, StatusResponsePayload, ActivatePayload } from "../shared/messages";
import { sanitizeStatus, sanitizeActivationResult, parseEventDetail } from "../shared/validation";

declare global {
  interface Window {
    __comviExtensionBridgeInstalled?: boolean;
  }
}

type RuntimeResponseCallback = (response: unknown, error?: string) => void;

const INVALIDATED_CONTEXT_ERROR = "Extension was reloaded. Reload this page to reconnect.";
let extensionContextInvalidated = false;

function runtimeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /extension context invalidated/i.test(message)
    ? INVALIDATED_CONTEXT_ERROR
    : message || "Extension unavailable";
}

/**
 * Content scripts survive an unpacked-extension reload until the page itself
 * reloads, but every chrome.runtime call in that stale world throws
 * synchronously. Convert that browser lifecycle edge into a normal failed
 * response and stop the now-disconnected editor exactly once.
 */
function sendRuntimeMessage(message: Message, callback?: RuntimeResponseCallback): void {
  const fail = (error: unknown): void => {
    const friendlyError = runtimeErrorMessage(error);
    const invalidated = friendlyError === INVALIDATED_CONTEXT_ERROR;
    if (invalidated && !extensionContextInvalidated) {
      extensionContextInvalidated = true;
      window.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));
    }
    callback?.(undefined, friendlyError);
  };

  if (extensionContextInvalidated) {
    callback?.(undefined, INVALIDATED_CONTEXT_ERROR);
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      let lastErrorMessage: string | undefined;
      try {
        lastErrorMessage = chrome.runtime.lastError?.message;
      } catch (error) {
        fail(error);
        return;
      }
      if (lastErrorMessage) {
        fail(lastErrorMessage);
        return;
      }
      callback?.(response);
    });
  } catch (error) {
    fail(error);
  }
}

// The popup may inject this script again on every open; install only once
// per page load (repeated executeScript calls share this isolated world).
if (!window.__comviExtensionBridgeInstalled) {
  window.__comviExtensionBridgeInstalled = true;
  sendRuntimeMessage({ type: "DOCUMENT_READY" });
  installBridge();
}

function installBridge() {
  let currentStatus: StatusResponsePayload = {
    comviDetected: false,
    editorActive: false,
  };

  // Single-use activation nonce from the popup's ACTIVATE_EDITOR command.
  // It stays in this isolated world — the page never sees it — and is
  // attached exactly once to the next activation result we relay, tying the
  // acknowledgement to a genuine popup-initiated activation.
  let pendingActivationNonce: string | undefined;

  function takeActivationNonce(): string | undefined {
    const nonce = pendingActivationNonce;
    pendingActivationNonce = undefined;
    return nonce;
  }

  function dispatchProxyResponse(detail: unknown) {
    window.dispatchEvent(
      new CustomEvent("comvi-extension:api-response", { detail: JSON.stringify(detail) }),
    );
  }

  function relayProxyRequest(request: {
    id: string;
    path: string;
    method?: string;
    body?: string;
    keepalive: boolean;
  }) {
    sendRuntimeMessage({ type: "API_PROXY_REQUEST", payload: request }, (response, error) => {
      const detail = error
        ? {
            id: request.id,
            ok: false,
            status: 0,
            statusText: "",
            body: "",
            networkError: error,
          }
        : (response ?? {
            id: request.id,
            ok: false,
            status: 0,
            statusText: "",
            body: "",
            networkError: "Extension unavailable",
          });
      dispatchProxyResponse(detail);
    });
  }

  window.addEventListener("comvi-extension:status", ((event: CustomEvent) => {
    const status = sanitizeStatus(event.detail);
    const wasDetected = currentStatus.comviDetected;
    currentStatus = status;

    // Bridge may have missed the initial 'comvi-extension:detected' event
    // because detector and bridge race to register listeners. Forward status
    // updates to background so the toolbar icon reflects detection.
    if (status.comviDetected && !wasDetected) {
      sendRuntimeMessage({ type: "COMVI_DETECTED", payload: currentStatus });
    }
  }) as EventListener);

  window.addEventListener("comvi-extension:detected", ((event: CustomEvent) => {
    currentStatus = { ...sanitizeStatus(event.detail), comviDetected: true };
    sendRuntimeMessage({ type: "COMVI_DETECTED", payload: currentStatus });
  }) as EventListener);

  window.addEventListener("comvi-extension:not-found", () => {
    currentStatus = { comviDetected: false, editorActive: false };
    sendRuntimeMessage({ type: "COMVI_NOT_FOUND", payload: currentStatus });
  });

  window.addEventListener("comvi-extension:activated", ((event: CustomEvent) => {
    const detail = sanitizeActivationResult(event.detail);
    if (detail.success) {
      currentStatus.editorActive = true;
    }
    sendRuntimeMessage({
      type: "EDITOR_ACTIVATED",
      // `collectContext` is derived by the editor from the page's i18n config.
      // The service worker uses the sanitized value to gate telemetry routes.
      payload: { ...detail, nonce: takeActivationNonce() },
    });
  }) as EventListener);

  window.addEventListener("comvi-extension:deactivated", ((event: CustomEvent) => {
    const detail = sanitizeActivationResult(event.detail);
    if (detail.success) {
      currentStatus.editorActive = false;
    }
    sendRuntimeMessage({ type: "EDITOR_DEACTIVATED", payload: detail });
  }) as EventListener);

  // SDK-side deactivation can happen without the popup command. This DOM
  // event is page-forgeable, so it is deliberately one-way: it may only
  // revoke the current tab's authority and can never create or activate it.
  window.addEventListener("comvi-in-context-editor:lifecycle", ((event: CustomEvent) => {
    const detail = parseEventDetail(event.detail);
    if (detail.state !== "deactivated") return;
    currentStatus.editorActive = false;
    sendRuntimeMessage({
      type: "EDITOR_DEACTIVATED",
      payload: { success: true },
    });
  }) as EventListener);

  // Relay proxied API requests from the editor runtime to the service
  // worker. The payload is page-controlled; only a fixed shape is forwarded
  // and the service worker independently re-validates everything.
  window.addEventListener("comvi-extension:api-request", ((event: CustomEvent) => {
    const raw = parseEventDetail(event.detail);
    const id = typeof raw.id === "string" ? raw.id : "";
    const request = {
      id,
      path: typeof raw.path === "string" ? raw.path : "",
      method: typeof raw.method === "string" ? raw.method : undefined,
      body: typeof raw.body === "string" ? raw.body : undefined,
      keepalive: raw.keepalive === true,
    };

    relayProxyRequest(request);
  }) as EventListener);

  // Relay page-side cancellation of an in-flight proxied request.
  window.addEventListener("comvi-extension:api-abort", ((event: CustomEvent) => {
    const raw = parseEventDetail(event.detail);
    if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > 128) return;
    sendRuntimeMessage({ type: "API_PROXY_ABORT", payload: { id: raw.id } });
  }) as EventListener);

  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    switch (message.type) {
      case "GET_STATUS":
        window.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
        sendResponse({ type: "STATUS_RESPONSE", payload: currentStatus });
        break;

      case "ACTIVATE_EDITOR": {
        // The nonce is retained here and never dispatched into the page;
        // credentials stay in the service worker.
        const payload = (message.payload ?? {}) as Partial<ActivatePayload>;
        pendingActivationNonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
        const pageDetail = {
          apiBaseUrl: typeof payload.apiBaseUrl === "string" ? payload.apiBaseUrl : "",
        };
        window.dispatchEvent(
          new CustomEvent("comvi-extension:activate", {
            detail: JSON.stringify(pageDetail),
          }),
        );
        sendResponse({ type: "STATUS_RESPONSE", payload: { pending: true } });
        break;
      }

      case "DEACTIVATE_EDITOR":
        window.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));
        sendResponse({ type: "STATUS_RESPONSE", payload: { pending: true } });
        break;
    }

    // Every handled command responds synchronously. Returning false also
    // prevents unrelated broadcasts from leaving a phantom response channel
    // open in every tab.
    return false;
  });

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
  }, 100);
}
