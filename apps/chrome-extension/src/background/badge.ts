/**
 * Toolbar icon and badge rendering.
 *
 * The icon variant (inactive/detected) is cosmetic and may follow
 * page-reported detection. The "ON" badge is an authority indicator and is
 * only ever derived from trusted service-worker session state — callers pass
 * `sessionActive` from the session record, never from page events.
 */

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

export function renderBadge(tabId: number, comviDetected: boolean, sessionActive: boolean) {
  const iconSet = comviDetected || sessionActive ? ICONS.detected : ICONS.inactive;
  chrome.action.setIcon({ path: iconSet, tabId });
  chrome.action.setBadgeText({ text: sessionActive ? "ON" : "", tabId });

  if (sessionActive) {
    chrome.action.setBadgeBackgroundColor({ color: BRAND_DARK, tabId });
    chrome.action.setBadgeTextColor({ color: BRAND_AMBER, tabId });
  }
}

export function resetBadge(tabId: number) {
  chrome.action.setIcon({ path: ICONS.inactive, tabId });
  chrome.action.setBadgeText({ text: "", tabId });
}
