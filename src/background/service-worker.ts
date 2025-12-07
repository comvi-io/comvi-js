/**
 * Background service worker for the Chrome extension
 *
 * Manages tab states, badge updates, and message routing.
 */

import type { Message, StatusResponsePayload } from "../shared/messages";

// Track tab states
interface TabState {
  tolkieDetected: boolean;
  editorActive: boolean;
  version?: string;
}

const tabStates = new Map<number, TabState>();

// Update badge based on tab state
function updateBadge(tabId: number, state: TabState) {
  if (state.editorActive) {
    chrome.action.setBadgeText({ text: "ON", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e", tabId });
  } else if (state.tolkieDetected) {
    chrome.action.setBadgeText({ text: "", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#3b82f6", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message: Message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  switch (message.type) {
    case "TOLKIE_DETECTED": {
      const payload = message.payload as StatusResponsePayload;
      const state: TabState = {
        tolkieDetected: true,
        editorActive: payload.editorActive ?? false,
        version: payload.version ?? undefined,
      };
      tabStates.set(tabId, state);
      updateBadge(tabId, state);
      break;
    }

    case "TOLKIE_NOT_FOUND": {
      const state: TabState = {
        tolkieDetected: false,
        editorActive: false,
      };
      tabStates.set(tabId, state);
      updateBadge(tabId, state);
      break;
    }

    case "EDITOR_ACTIVATED": {
      const currentState = tabStates.get(tabId) || {
        tolkieDetected: true,
        editorActive: false,
      };
      currentState.editorActive = true;
      tabStates.set(tabId, currentState);
      updateBadge(tabId, currentState);
      break;
    }

    case "EDITOR_DEACTIVATED": {
      const currentState = tabStates.get(tabId);
      if (currentState) {
        currentState.editorActive = false;
        updateBadge(tabId, currentState);
      }
      break;
    }
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// Reset state when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabStates.delete(tabId);
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

// Export for popup to query
export function getTabState(tabId: number): TabState | undefined {
  return tabStates.get(tabId);
}
