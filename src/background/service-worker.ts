/**
 * Background service worker for the Chrome extension
 *
 * Manages tab states, icon updates, badge updates, and message routing.
 */

import type { Message, StatusResponsePayload } from "../shared/messages";

// Icon paths for different states.
// Only two visual states: inactive (Comvi i18n not on page) and detected
// (Comvi i18n present). Editor-on state reuses the detected icon and is
// indicated by a brand-colored "ON" badge instead of a third icon variant.
const ICONS = {
  inactive: {
    16: "icons/icon-inactive-16.png",
    32: "icons/icon-inactive-32.png",
    48: "icons/icon-inactive-48.png",
  },
  detected: {
    16: "icons/icon-detected-16.png",
    32: "icons/icon-detected-32.png",
    48: "icons/icon-detected-48.png",
  },
} as const;

// Brand colors (mirror popup tokens in popup.css)
const BRAND_AMBER = "#d97706";
const BRAND_DARK = "#19191a";

// Track tab states
interface TabState {
  comviDetected: boolean;
  editorActive: boolean;
  version?: string;
}

const tabStates = new Map<number, TabState>();

// Update icon and badge based on tab state
function updateIcon(tabId: number, state: TabState) {
  const iconSet = state.comviDetected ? ICONS.detected : ICONS.inactive;
  const badgeText = state.editorActive ? "ON" : "";

  chrome.action.setIcon({ path: iconSet, tabId });
  chrome.action.setBadgeText({ text: badgeText, tabId });

  if (state.editorActive) {
    chrome.action.setBadgeBackgroundColor({ color: BRAND_DARK, tabId });
    chrome.action.setBadgeTextColor({ color: BRAND_AMBER, tabId });
  }
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
      const detail = (message.payload ?? {}) as { success?: boolean };
      // Only flip badge to ON when activation actually succeeded.
      // CDN load failures, bad keys, etc. send EDITOR_ACTIVATED with success: false.
      if (!detail.success) break;
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
