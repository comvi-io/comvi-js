import "./popup.css";
import { getCredentials } from "../shared/storage";
import { canonicalizePageOrigin } from "../shared/origins";
import { API_BASE_URL } from "../shared/config";
import type {
  Message,
  StatusResponsePayload,
  ActivatePayload,
  StartSessionPayload,
  StartSessionResponse,
  SessionStatusResponse,
} from "../shared/messages";

type Theme = "light" | "dark";
type View = "not-detected" | "idle" | "active";

const THEME_STORAGE_KEY = "comvi_theme";

// DOM
const root = document.documentElement;
const themeToggleBtn = document.getElementById("theme-toggle") as HTMLButtonElement;
const themeIconSun = document.getElementById("theme-icon-sun")!;
const themeIconMoon = document.getElementById("theme-icon-moon")!;
const stateNotDetected = document.getElementById("state-not-detected")!;
const stateIdle = document.getElementById("state-idle")!;
const stateActive = document.getElementById("state-active")!;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const toggleKeyBtn = document.getElementById("toggle-key-btn") as HTMLButtonElement;
const keyIconShow = document.getElementById("key-icon-show")!;
const keyIconHide = document.getElementById("key-icon-hide")!;
const forgetKeyBtn = document.getElementById("forget-key-btn") as HTMLButtonElement;
const enableBtn = document.getElementById("enable-btn") as HTMLButtonElement;
const disableBtn = document.getElementById("disable-btn") as HTMLButtonElement;
const errorMsg = document.getElementById("error-msg")!;
const versionLine = document.getElementById("version-line")!;
const collectContextInput = document.getElementById("collect-context") as HTMLInputElement;

// A pending activation is owned by this popup's Port. MV3 reliably disconnects
// it when the popup closes, allowing the service worker to revoke immediately.
const popupLeaseId = crypto.randomUUID();
const popupLifecyclePort = chrome.runtime.connect({ name: "comvi-popup-lifecycle" });
const popupLeaseReady = new Promise<boolean>((resolve) => {
  let settled = false;
  popupLifecyclePort.onMessage.addListener((message: unknown) => {
    const response = message as { type?: unknown; leaseId?: unknown };
    if (response.type === "POPUP_REGISTERED" && response.leaseId === popupLeaseId && !settled) {
      settled = true;
      resolve(true);
    }
  });
  popupLifecyclePort.onDisconnect.addListener(() => {
    if (!settled) {
      settled = true;
      resolve(false);
    }
  });
});
popupLifecyclePort.postMessage({ type: "REGISTER_POPUP", leaseId: popupLeaseId });

// State
let currentTabId: number | null = null;
let currentOrigin = "";
let editorActive = false;
let editorLoaded = false;
let comviDetected = false;
let comviVersion: string | undefined;

// --- Theme ---

async function readStoredTheme(): Promise<Theme | null> {
  const result = await chrome.storage.local.get(THEME_STORAGE_KEY);
  const value = result[THEME_STORAGE_KEY];
  return value === "light" || value === "dark" ? value : null;
}

function detectSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  root.classList.toggle("dark", theme === "dark");
  themeIconSun.classList.toggle("hidden", theme !== "dark");
  themeIconMoon.classList.toggle("hidden", theme === "dark");
}

async function initTheme() {
  const stored = await readStoredTheme();
  const theme = stored ?? detectSystemTheme();
  applyTheme(theme);

  themeToggleBtn.addEventListener("click", async () => {
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    await chrome.storage.local.set({ [THEME_STORAGE_KEY]: next });
  });
}

// --- View switching ---

function setView(view: View) {
  for (const [id, el] of [
    ["not-detected", stateNotDetected],
    ["idle", stateIdle],
    ["active", stateActive],
  ] as const) {
    const visible = id === view;
    el.classList.toggle("hidden", !visible);
    el.classList.toggle("flex", visible && id !== "not-detected");
  }
}

function showError(message: string) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}

function hideError() {
  errorMsg.classList.add("hidden");
  errorMsg.textContent = "";
}

function render() {
  if (!comviDetected) {
    setView("not-detected");
    return;
  }

  if (editorActive) {
    versionLine.textContent = comviVersion ? `Comvi i18n v${comviVersion}` : "";
    setView("active");
    return;
  }

  setView("idle");
}

// --- Messaging ---

function sendToContentScript(message: Message): Promise<{ payload?: unknown } | undefined> {
  if (!currentTabId) return Promise.reject(new Error("No tab ID"));

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(currentTabId!, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function sendToServiceWorker<T>(message: Message): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response as T);
      }
    });
  });
}

async function requestStatus(retries = 4) {
  if (!currentTabId) return;

  try {
    const response = await sendToContentScript({ type: "GET_STATUS" });
    if (response?.payload) updateStatus(response.payload as StatusResponsePayload);
  } catch {
    if (retries > 0) setTimeout(() => requestStatus(retries - 1), 500);
  }
}

function updateStatus(status: StatusResponsePayload) {
  // Page-reported status drives detection UI only. `editorActive` (which
  // gates the active view) comes from the service worker's session state —
  // a page cannot talk this popup into showing a fake "active" panel.
  comviDetected = status.comviDetected;
  editorLoaded = status.editorLoaded ?? editorLoaded;
  if (status.version) comviVersion = status.version;
  render();
}

// --- API key field ---

function setKeyVisibility(visible: boolean) {
  apiKeyInput.type = visible ? "text" : "password";
  keyIconShow.classList.toggle("hidden", visible);
  keyIconHide.classList.toggle("hidden", !visible);
  toggleKeyBtn.setAttribute("aria-label", visible ? "Hide API key" : "Show API key");
}

function setForgetVisible(visible: boolean) {
  forgetKeyBtn.classList.toggle("hidden", !visible);
}

async function handleForgetKey() {
  if (!currentOrigin) return;
  // The service worker owns revocation: it clears the credential AND every
  // session that was opened with it, across all tabs, atomically.
  await sendToServiceWorker({
    type: "FORGET_CREDENTIALS",
    payload: { origin: currentOrigin },
  }).catch(() => {});
  apiKeyInput.value = "";
  setForgetVisible(false);
  apiKeyInput.focus();
}

/** Ask the service worker for the authoritative session state and render it. */
async function syncSessionStatus() {
  if (!currentTabId) return;
  try {
    const status = await sendToServiceWorker<SessionStatusResponse>({
      type: "GET_SESSION_STATUS",
      payload: { tabId: currentTabId },
    });
    editorActive = status?.active === true;
  } catch {
    editorActive = false;
  }
  render();
}

// --- Actions ---

/**
 * Re-resolve the active tab right before doing anything privileged, so a
 * navigation between popup-open and button-click can't redirect injection
 * or the session to a different origin (TOCTOU). The service worker repeats
 * these checks independently — this is UX-level early failure.
 */
async function getVerifiedTab(): Promise<{ tabId: number; origin: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;
  const origin = canonicalizePageOrigin(tab.url);
  if (tab.id !== currentTabId || !origin || origin !== currentOrigin) return null;
  return { tabId: tab.id, origin };
}

// Rollback timer: if activation never acknowledges, close the pending
// session instead of leaving it to idle out server-side.
let activationTimeout: number | null = null;

function clearActivationTimeout() {
  if (activationTimeout !== null) {
    window.clearTimeout(activationTimeout);
    activationTimeout = null;
  }
}

function rollbackSession(tabId: number) {
  void sendToServiceWorker({ type: "END_SESSION", payload: { tabId } }).catch(() => {});
}

async function handleEnable() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError("Please enter an API key");
    apiKeyInput.focus();
    return;
  }

  hideError();
  enableBtn.disabled = true;
  enableBtn.textContent = "Enabling…";

  const restoreButton = () => {
    enableBtn.disabled = false;
    enableBtn.textContent = "Enable editor";
  };

  try {
    const verified = await getVerifiedTab();
    if (!verified) {
      showError("The page changed. Close and reopen the popup.");
      restoreButton();
      return;
    }

    if (!(await popupLeaseReady)) {
      showError("The popup connection closed. Reopen it and try again.");
      restoreButton();
      return;
    }

    // 1. Validate the key and open a PENDING proxy session — the key goes to
    // the service worker only and never into the page. Requests are refused
    // until activation is acknowledged.
    const collectContext = collectContextInput.checked;
    const payload: StartSessionPayload = {
      tabId: verified.tabId,
      origin: verified.origin,
      apiKey,
      collectContext,
      popupLeaseId,
    };
    const session = await sendToServiceWorker<StartSessionResponse>({
      type: "START_SESSION",
      payload,
    });
    if (!session?.ok || !session.nonce) {
      showError(session?.error ?? "Could not validate the API key");
      restoreButton();
      return;
    }
    setForgetVisible(true);

    try {
      // 2. Inject the bundled editor runtime into the page's MAIN world. The
      // runtime ships inside the extension package (MV3 forbids remote code).
      if (!editorLoaded) {
        await chrome.scripting.executeScript({
          target: { tabId: verified.tabId },
          files: ["editor.iife.js"],
          world: "MAIN",
        });
        editorLoaded = true;
      }

      // 3. Activate with non-secret configuration. The nonce stays inside
      // extension messaging (popup -> bridge) and ties the acknowledgement
      // to this exact activation.
      const activatePayload: ActivatePayload = {
        apiBaseUrl: API_BASE_URL,
        collectContext,
        nonce: session.nonce,
      };
      await sendToContentScript({ type: "ACTIVATE_EDITOR", payload: activatePayload });
    } catch (err) {
      // Injection or messaging failed — the pending session must not linger.
      rollbackSession(verified.tabId);
      throw err;
    }

    // 4. If no acknowledgement arrives, roll the pending session back.
    clearActivationTimeout();
    activationTimeout = window.setTimeout(() => {
      activationTimeout = null;
      rollbackSession(verified.tabId);
      showError("The editor did not respond. Reload the page and try again.");
      restoreButton();
      void syncSessionStatus();
    }, 15_000);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Failed to enable editor");
    restoreButton();
  }
}

async function handleDisable() {
  if (!currentTabId) return;

  disableBtn.disabled = true;
  disableBtn.textContent = "Disabling…";

  try {
    await sendToContentScript({ type: "DEACTIVATE_EDITOR" });
    // Belt and braces: close the proxy session even if the content script's
    // deactivation report never arrives.
    void sendToServiceWorker({ type: "END_SESSION", payload: { tabId: currentTabId } }).catch(
      () => {},
    );
  } catch {
    disableBtn.disabled = false;
    disableBtn.textContent = "Disable editor";
  }
}

// --- Init ---

async function injectContentScripts(tabId: number): Promise<boolean> {
  // Injected on demand under the activeTab grant instead of running on
  // <all_urls>. Both scripts are idempotent (guarded against re-injection).
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["detector.js"],
      world: "MAIN",
    });
    return true;
  } catch {
    // Restricted pages (chrome://, Web Store, etc.) — leave "not detected".
    return false;
  }
}

async function init() {
  await initTheme();

  // Render not-detected up front so the popup never shows blank,
  // even before the content script replies (or if it never can).
  render();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  currentTabId = tab.id;
  currentOrigin = canonicalizePageOrigin(tab.url) ?? "";

  const credentials = await getCredentials(currentOrigin);
  if (credentials?.apiKey) {
    apiKeyInput.value = credentials.apiKey;
    setForgetVisible(true);
  }

  enableBtn.addEventListener("click", handleEnable);
  disableBtn.addEventListener("click", handleDisable);
  forgetKeyBtn.addEventListener("click", handleForgetKey);
  toggleKeyBtn.addEventListener("click", () => setKeyVisibility(apiKeyInput.type === "password"));
  apiKeyInput.addEventListener("input", hideError);
  apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleEnable();
  });

  await syncSessionStatus();
  const injected = await injectContentScripts(currentTabId);
  if (injected) requestStatus();
}

chrome.runtime.onMessage.addListener((message: Message, sender) => {
  // Only trust events reported by the tab this popup is bound to — another
  // tab's content script must not be able to flip this popup's UI state.
  if (sender.tab?.id !== currentTabId) return;

  switch (message.type) {
    case "EDITOR_ACTIVATED": {
      const detail = (message.payload ?? {}) as { success?: boolean; error?: string };
      clearActivationTimeout();
      enableBtn.disabled = false;
      enableBtn.textContent = "Enable editor";
      if (detail.success) {
        hideError();
      } else {
        if (detail.error) showError(detail.error);
        // The service worker rolls the pending session back via the nonce;
        // this is belt-and-braces for lost messages.
        if (currentTabId) rollbackSession(currentTabId);
      }
      // Render from the service worker's authoritative state, not from the
      // page-reported result.
      void syncSessionStatus();
      break;
    }

    case "EDITOR_DEACTIVATED":
      disableBtn.disabled = false;
      disableBtn.textContent = "Disable editor";
      void syncSessionStatus();
      break;

    case "STATUS_RESPONSE":
      updateStatus(message.payload as StatusResponsePayload);
      break;
  }
});

init();
