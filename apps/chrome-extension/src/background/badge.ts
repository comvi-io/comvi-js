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

function isClosedTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("No tab with id");
}

/**
 * Tabs can disappear between the state mutation and these cosmetic action
 * updates. Consume that expected rejection so Chrome does not emit an
 * unhandled Promise/runtime.lastError warning; preserve diagnostics for
 * genuinely unexpected toolbar failures.
 */
function updateToolbar(operation: () => Promise<void>): void {
  try {
    void Promise.resolve(operation()).catch((error) => {
      if (!isClosedTabError(error)) {
        console.warn("[ComviExtension] Failed to update toolbar state.", error);
      }
    });
  } catch (error) {
    if (!isClosedTabError(error)) {
      console.warn("[ComviExtension] Failed to update toolbar state.", error);
    }
  }
}

export function renderBadge(tabId: number, comviDetected: boolean, sessionActive: boolean) {
  const iconSet = comviDetected || sessionActive ? ICONS.detected : ICONS.inactive;
  updateToolbar(() => chrome.action.setIcon({ path: iconSet, tabId }));
  updateToolbar(() => chrome.action.setBadgeText({ text: sessionActive ? "ON" : "", tabId }));

  if (sessionActive) {
    updateToolbar(() => chrome.action.setBadgeBackgroundColor({ color: BRAND_DARK, tabId }));
    updateToolbar(() => chrome.action.setBadgeTextColor({ color: BRAND_AMBER, tabId }));
  }
}

export function resetBadge(tabId: number) {
  updateToolbar(() => chrome.action.setIcon({ path: ICONS.inactive, tabId }));
  updateToolbar(() => chrome.action.setBadgeText({ text: "", tabId }));
}
