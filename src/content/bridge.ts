/**
 * Content script running in ISOLATED world
 *
 * This script bridges communication between the page (MAIN world)
 * and the extension (background/popup). It listens for custom events
 * from the detector script and forwards messages via chrome.runtime.
 */

import type { Message, StatusResponsePayload, ActivatePayload } from "../shared/messages";

// State
let currentStatus: StatusResponsePayload = {
  comviDetected: false,
  editorActive: false,
};

// Listen for status from detector (MAIN world)
window.addEventListener("comvi-extension:status", ((event: CustomEvent) => {
  const detail = event.detail;
  const wasDetected = currentStatus.comviDetected;
  currentStatus = {
    comviDetected: detail.detected,
    editorActive: detail.editorActive,
    editorLoaded: detail.editorLoaded,
    version: detail.version,
    instanceCount: detail.instanceCount,
  };

  // Bridge may have missed the initial 'comvi-extension:detected' event
  // because detector and bridge race to register listeners at document_idle.
  // Forward status updates to background so the toolbar icon reflects detection.
  if (detail.detected && !wasDetected) {
    chrome.runtime.sendMessage({ type: "COMVI_DETECTED", payload: currentStatus });
  }
}) as EventListener);

// Listen for detection events
window.addEventListener("comvi-extension:detected", ((event: CustomEvent) => {
  const detail = event.detail;
  currentStatus = {
    comviDetected: true,
    editorActive: detail.editorActive,
    editorLoaded: detail.editorLoaded,
    version: detail.version,
    instanceCount: detail.instanceCount,
  };

  // Notify background script
  chrome.runtime.sendMessage({
    type: "COMVI_DETECTED",
    payload: currentStatus,
  });
}) as EventListener);

window.addEventListener("comvi-extension:not-found", () => {
  currentStatus = {
    comviDetected: false,
    editorActive: false,
  };

  chrome.runtime.sendMessage({
    type: "COMVI_NOT_FOUND",
    payload: currentStatus,
  });
});

// Listen for activation result
window.addEventListener("comvi-extension:activated", ((event: CustomEvent) => {
  const detail = event.detail;
  if (detail.success) {
    currentStatus.editorActive = true;
  }
  chrome.runtime.sendMessage({
    type: "EDITOR_ACTIVATED",
    payload: detail,
  });
}) as EventListener);

// Listen for deactivation result
window.addEventListener("comvi-extension:deactivated", ((event: CustomEvent) => {
  const detail = event.detail;
  if (detail.success) {
    currentStatus.editorActive = false;
  }
  chrome.runtime.sendMessage({
    type: "EDITOR_DEACTIVATED",
    payload: detail,
  });
}) as EventListener);

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case "GET_STATUS":
      // Request fresh status from detector
      window.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
      // Send current cached status immediately
      sendResponse({ type: "STATUS_RESPONSE", payload: currentStatus });
      break;

    case "ACTIVATE_EDITOR": {
      const activatePayload = message.payload as ActivatePayload;
      window.dispatchEvent(
        new CustomEvent("comvi-extension:activate", {
          detail: JSON.stringify(activatePayload),
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

  return true; // Keep channel open for async response
});

// Request initial status
setTimeout(() => {
  window.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
}, 100);
