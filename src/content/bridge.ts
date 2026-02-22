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
  tolkieDetected: false,
  editorActive: false,
};

// Listen for status from detector (MAIN world)
window.addEventListener("tolkie-extension:status", ((event: CustomEvent) => {
  const detail = event.detail;
  currentStatus = {
    tolkieDetected: detail.detected,
    editorActive: detail.editorActive,
    version: detail.version,
    instanceCount: detail.instanceCount,
  };
}) as EventListener);

// Listen for detection events
window.addEventListener("tolkie-extension:detected", ((event: CustomEvent) => {
  const detail = event.detail;
  currentStatus = {
    tolkieDetected: true,
    editorActive: detail.editorActive,
    version: detail.version,
    instanceCount: detail.instanceCount,
  };

  // Notify background script
  chrome.runtime.sendMessage({
    type: "TOLKIE_DETECTED",
    payload: currentStatus,
  });
}) as EventListener);

window.addEventListener("tolkie-extension:not-found", () => {
  currentStatus = {
    tolkieDetected: false,
    editorActive: false,
  };

  chrome.runtime.sendMessage({
    type: "TOLKIE_NOT_FOUND",
    payload: currentStatus,
  });
});

// Listen for activation result
window.addEventListener("tolkie-extension:activated", ((event: CustomEvent) => {
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
window.addEventListener("tolkie-extension:deactivated", ((event: CustomEvent) => {
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
      window.dispatchEvent(new CustomEvent("tolkie-extension:get-status"));
      // Send current cached status immediately
      sendResponse({ type: "STATUS_RESPONSE", payload: currentStatus });
      break;

    case "ACTIVATE_EDITOR":
      const activatePayload = message.payload as ActivatePayload;
      window.dispatchEvent(
        new CustomEvent("tolkie-extension:activate", {
          detail: activatePayload,
        }),
      );
      sendResponse({ type: "STATUS_RESPONSE", payload: { pending: true } });
      break;

    case "DEACTIVATE_EDITOR":
      window.dispatchEvent(new CustomEvent("tolkie-extension:deactivate"));
      sendResponse({ type: "STATUS_RESPONSE", payload: { pending: true } });
      break;
  }

  return true; // Keep channel open for async response
});

// Request initial status
setTimeout(() => {
  window.dispatchEvent(new CustomEvent("tolkie-extension:get-status"));
}, 100);
