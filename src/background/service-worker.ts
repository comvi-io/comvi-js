/**
 * Background service worker for the Chrome extension
 *
 * Manages tab states, icon updates, badge updates, and message routing.
 */

import type { Message, StatusResponsePayload } from "../shared/messages";

// Icon paths for different states
const ICONS = {
  inactive: {
    16: "icons/icon-inactive-16.svg",
    32: "icons/icon-inactive-32.svg",
    48: "icons/icon-inactive-48.svg",
  },
  detected: {
    16: "icons/icon-detected-16.svg",
    32: "icons/icon-detected-32.svg",
    48: "icons/icon-detected-48.svg",
  },
  active: {
    16: "icons/icon-active-16.svg",
    32: "icons/icon-active-32.svg",
    48: "icons/icon-active-48.svg",
  },
} as const;

// Track tab states
interface TabState {
  comviDetected: boolean;
  editorActive: boolean;
  version?: string;
}

const tabStates = new Map<number, TabState>();

// Update icon and badge based on tab state
function updateIcon(tabId: number, state: TabState) {
  let iconSet: (typeof ICONS)[keyof typeof ICONS];
  let badgeText = "";
  let badgeColor = "#9ca3af";

  if (state.editorActive) {
    iconSet = ICONS.active;
    badgeText = "ON";
    badgeColor = "#22c55e";
  } else if (state.comviDetected) {
    iconSet = ICONS.detected;
    badgeColor = "#3b82f6";
  } else {
    iconSet = ICONS.inactive;
  }

  // Update icon
  chrome.action.setIcon({ path: iconSet, tabId });

  // Update badge
  chrome.action.setBadgeText({ text: badgeText, tabId });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
}

// Reset icon to default (inactive) state
function resetIcon(tabId: number) {
  chrome.action.setIcon({ path: ICONS.inactive, tabId });
  chrome.action.setBadgeText({ text: "", tabId });
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message: Message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  switch (message.type) {
    case "COMVI_DETECTED": {
      const payload = message.payload as StatusResponsePayload;
      const state: TabState = {
        comviDetected: true,
        editorActive: payload.editorActive ?? false,
        version: payload.version ?? undefined,
      };
      tabStates.set(tabId, state);
      updateIcon(tabId, state);
      break;
    }

    case "COMVI_NOT_FOUND": {
      const state: TabState = {
        comviDetected: false,
        editorActive: false,
      };
      tabStates.set(tabId, state);
      updateIcon(tabId, state);
      break;
    }

    case "EDITOR_ACTIVATED": {
      const currentState = tabStates.get(tabId) || {
        comviDetected: true,
        editorActive: false,
      };
      currentState.editorActive = true;
      tabStates.set(tabId, currentState);
      updateIcon(tabId, currentState);
      break;
    }

    case "EDITOR_DEACTIVATED": {
      const currentState = tabStates.get(tabId);
      if (currentState) {
        currentState.editorActive = false;
        updateIcon(tabId, currentState);
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
    resetIcon(tabId);
  }
});

// Export for popup to query
export function getTabState(tabId: number): TabState | undefined {
  return tabStates.get(tabId);
}
