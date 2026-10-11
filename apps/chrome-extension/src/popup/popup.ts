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
  SessionStateChangedPayload,
} from "../shared/messages";

type Theme = "light" | "dark";
type View = "loading" | "not-detected" | "idle" | "active";
type Operation = "enabling" | "disabling" | "forgetting" | null;

const THEME_STORAGE_KEY = "comvi_theme";

const root = document.documentElement;
const themeToggleBtn = document.getElementById("theme-toggle") as HTMLButtonElement;
const themeIconSun = document.getElementById("theme-icon-sun")!;
const themeIconMoon = document.getElementById("theme-icon-moon")!;
const stateLoading = document.getElementById("state-loading")!;
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
const operationStatus = document.getElementById("operation-status")!;
const operationStatusText = document.getElementById("operation-status-text")!;

const popupLeaseId = crypto.randomUUID();
let popupLifecyclePort: chrome.runtime.Port | null = null;
let popupLeaseReady: Promise<boolean> | null = null;

let currentTabId: number | null = null;
let currentOrigin = "";
let editorActive = false;
let editorLoaded = false;
let comviDetected = false;
let comviVersion: string | undefined;
let initialized = false;
let operation: Operation = null;
let forgetAvailable = false;
let keyInputDirty = false;
let liveStatusObserved = false;

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
  // Paint a usable theme before touching extension storage. A cold disk read
  // must not hold the first popup frame.
  let changedByUser = false;
  applyTheme(detectSystemTheme());

  themeToggleBtn.addEventListener("click", async () => {
    changedByUser = true;
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    await chrome.storage.local.set({ [THEME_STORAGE_KEY]: next });
  });

  try {
    const stored = await readStoredTheme();
    if (stored && !changedByUser) applyTheme(stored);
  } catch {
    // The system theme already rendered; storage failure is non-blocking.
  }
}

// --- View switching ---

function setView(view: View) {
  for (const [id, el] of [
    ["loading", stateLoading],
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
  enableBtn.disabled = operation !== null;
  disableBtn.disabled = operation !== null;
  apiKeyInput.disabled = operation !== null;
  toggleKeyBtn.disabled = operation !== null;
  forgetKeyBtn.disabled = operation !== null;
  forgetKeyBtn.classList.toggle("hidden", !forgetAvailable);
  disableBtn.textContent = operation === "disabling" ? "Disabling…" : "Disable editor";

  if (!initialized) {
    setView("loading");
    return;
  }

  // Authority takes precedence over detector metadata. A delayed detector
  // response must never hide a successfully activated editor.
  if (editorActive) {
    versionLine.textContent = comviVersion ? `Comvi i18n v${comviVersion}` : "";
    setView("active");
    return;
  }

  if (!comviDetected) {
    setView("not-detected");
    return;
  }

  setView("idle");
}

function setOperation(next: Operation, progress = "") {
  operation = next;
  operationStatus.classList.toggle("hidden", next !== "enabling" && next !== "forgetting");
  operationStatus.classList.toggle("flex", next === "enabling" || next === "forgetting");
  operationStatusText.textContent = progress;
  enableBtn.textContent = next === "enabling" ? "Enabling…" : "Enable editor";
  render();
}

function setProgress(message: string) {
  operationStatusText.textContent = message;
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

async function requestStatus(): Promise<boolean> {
  if (!currentTabId) return false;

  try {
    const response = await sendToContentScript({ type: "GET_STATUS" });
    if (!response?.payload) return false;
    updateStatus(response.payload as StatusResponsePayload);
    return true;
  } catch {
    return false;
  }
}

function updateStatus(status: StatusResponsePayload) {
  // Page-reported status drives detection UI only. `editorActive` (which
  // gates the active view) comes from the service worker's session state —
  // a page cannot talk this popup into showing a fake "active" panel.
  liveStatusObserved = true;
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
  forgetAvailable = visible;
  render();
}

async function handleForgetKey() {
  if (!currentOrigin || operation) return;
  hideError();
  setOperation("forgetting", "Removing saved key…");
  // The service worker owns revocation: it clears the credential AND every
  // session that was opened with it, across all tabs, atomically.
  try {
    const response = await sendToServiceWorker<{ ok: boolean; error?: string }>({
      type: "FORGET_CREDENTIALS",
      payload: { origin: currentOrigin },
    });
    if (!response?.ok) throw new Error(response?.error ?? "Could not remove the saved key");
    apiKeyInput.value = "";
    setForgetVisible(false);
    setOperation(null);
    apiKeyInput.focus();
  } catch (error) {
    setOperation(null);
    showError(error instanceof Error ? error.message : "Could not remove the saved key");
  }
}

function applySessionStatus(
  status: SessionStatusResponse | undefined,
  applyCachedDetection = true,
) {
  // A missing response means the cold service worker was unavailable, not
  // that an already-rendered active session became inactive.
  if (!status) return;
  editorActive = status.active === true;
  if (applyCachedDetection && typeof status.comviDetected === "boolean") {
    comviDetected = status.comviDetected;
  }
  if (status.version) comviVersion = status.version;
}

/** Ask the service worker for the authoritative session state. */
async function getAuthoritativeStatus(): Promise<SessionStatusResponse | undefined> {
  if (!currentTabId) return undefined;
  return sendToServiceWorker<SessionStatusResponse>({
    type: "GET_SESSION_STATUS",
    payload: { tabId: currentTabId },
  }).catch(() => undefined);
}

/**
 * A pending activation is owned by this popup's Port. Create the lease only
 * when Enable is clicked: opening the popup for status must not synchronously
 * wake and register lifecycle infrastructure that the user may never use.
 */
function ensurePopupLease(): Promise<boolean> {
  if (popupLeaseReady) return popupLeaseReady;

  const port = chrome.runtime.connect({ name: "comvi-popup-lifecycle" });
  popupLifecyclePort = port;
  popupLeaseReady = new Promise<boolean>((resolve) => {
    let settled = false;
    port.onMessage.addListener((message: unknown) => {
      const response = message as { type?: unknown; leaseId?: unknown };
      if (response.type === "POPUP_REGISTERED" && response.leaseId === popupLeaseId && !settled) {
        settled = true;
        resolve(true);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
      if (popupLifecyclePort === port) {
        popupLifecyclePort = null;
        popupLeaseReady = null;
      }
    });
  });
  port.postMessage({ type: "REGISTER_POPUP", leaseId: popupLeaseId });
  return popupLeaseReady;
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

async function rollbackActivation(tabId: number, nonce: string) {
  await sendToServiceWorker({
    type: "ROLLBACK_ACTIVATION",
    payload: { tabId, nonce },
  }).catch(() => undefined);
}

function armActivationTimeout(tabId: number, nonce: string) {
  clearActivationTimeout();
  activationTimeout = window.setTimeout(() => {
    activationTimeout = null;
    void (async () => {
      showError("The editor did not respond. Reload the page and try again.");
      await rollbackActivation(tabId, nonce);
      const status = await getAuthoritativeStatus();
      applySessionStatus(status);
      if (editorActive) hideError();
      setOperation(null);
    })();
  }, 15_000);
}

async function handleEnable() {
  if (operation) return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError("Please enter an API key");
    apiKeyInput.focus();
    return;
  }

  hideError();
  setOperation("enabling", "Checking key…");

  try {
    const verified = await getVerifiedTab();
    if (!verified) {
      showError("The page changed. Close and reopen the popup.");
      setOperation(null);
      return;
    }

    if (!(await ensurePopupLease())) {
      showError("The popup connection closed. Reopen it and try again.");
      setOperation(null);
      return;
    }

    // 1. Validate the key and open a PENDING proxy session — the key goes to
    // the service worker only and never into the page. Requests are refused
    // until activation is acknowledged.
    const payload: StartSessionPayload = {
      tabId: verified.tabId,
      origin: verified.origin,
      apiKey,
      popupLeaseId,
    };
    const session = await sendToServiceWorker<StartSessionResponse>({
      type: "START_SESSION",
      payload,
    });
    if (!session?.ok || !session.nonce) {
      showError(session?.error ?? "Could not validate the API key");
      setOperation(null);
      return;
    }
    setForgetVisible(true);
    // Arm before page activation: the acknowledgement can be synchronous.
    armActivationTimeout(verified.tabId, session.nonce);
    setProgress("Starting editor…");

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
        nonce: session.nonce,
      };
      await sendToContentScript({ type: "ACTIVATE_EDITOR", payload: activatePayload });
      setProgress("Confirming activation…");
    } catch (err) {
      // Injection or messaging failed — the pending session must not linger.
      clearActivationTimeout();
      await rollbackActivation(verified.tabId, session.nonce);
      throw err;
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : "Failed to enable editor");
    setOperation(null);
  }
}

async function handleDisable() {
  if (!currentTabId || operation) return;
  hideError();
  setOperation("disabling");

  try {
    // Revoke authority first. The UI can then transition immediately without
    // racing the page's asynchronous deactivation acknowledgement.
    const response = await sendToServiceWorker<{ ok: boolean }>({
      type: "END_SESSION",
      payload: { tabId: currentTabId },
    });
    if (!response?.ok) throw new Error("Could not disable the editor");
    editorActive = false;
    setOperation(null);
  } catch (error) {
    setOperation(null);
    showError(error instanceof Error ? error.message : "Could not disable the editor");
  }
}

// --- Init ---

async function injectContentScripts(tabId: number): Promise<boolean> {
  // The manifest preloads both scripts for automatic icon detection. Re-run
  // them under activeTab as an idempotent fallback for extension upgrades and
  // pages whose initial content-script injection was missed.
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
  render();
  bindEvents();
  void initTheme();

  // Resolving the active tab is the only prerequisite for page-specific
  // work. Theme, credentials, service-worker status and page status continue
  // independently so a cold source cannot hold the whole popup hostage.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    initialized = true;
    render();
    return;
  }

  currentTabId = tab.id;
  currentOrigin = canonicalizePageOrigin(tab.url) ?? "";

  void getCredentials(currentOrigin)
    .then((credentials) => {
      if (!credentials?.apiKey || keyInputDirty || apiKeyInput.value !== "") return;
      apiKeyInput.value = credentials.apiKey;
      setForgetVisible(true);
    })
    .catch(() => {});

  void getAuthoritativeStatus().then((sessionStatus) => {
    applySessionStatus(sessionStatus, !liveStatusObserved);
    if (editorActive || typeof sessionStatus?.comviDetected === "boolean") {
      initialized = true;
    }
    render();
  });

  void (async () => {
    // The manifest normally preloads both scripts, so this is the fastest and
    // most common source. If it misses, show a result immediately and repair
    // the content scripts in the background instead of displaying a spinner.
    if (await requestStatus()) {
      initialized = true;
      render();
      return;
    }

    initialized = true;
    render();
    const injected = await injectContentScripts(currentTabId!);
    if (injected) await requestStatus();
  })();
}

function bindEvents() {
  enableBtn.addEventListener("click", handleEnable);
  disableBtn.addEventListener("click", handleDisable);
  forgetKeyBtn.addEventListener("click", handleForgetKey);
  toggleKeyBtn.addEventListener("click", () => setKeyVisibility(apiKeyInput.type === "password"));
  apiKeyInput.addEventListener("input", () => {
    keyInputDirty = true;
    hideError();
  });
  apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !operation) void handleEnable();
  });
}

chrome.runtime.onMessage.addListener((message: Message, sender) => {
  if (message.type === "SESSION_STATE_CHANGED") {
    // Only the service worker (no sender.tab) may complete popup lifecycle.
    if (sender.tab) return;
    const state = (message.payload ?? {}) as SessionStateChangedPayload;
    if (state.tabId !== currentTabId) return;
    applySessionStatus(state);
    // A still-pending result is not a lifecycle completion and must not
    // unlock the controls or cancel the activation deadline.
    if (state.pending) {
      render();
      return;
    }
    if (state.active) {
      comviDetected = true;
      hideError();
    } else if (operation === "enabling" && state.error) {
      showError(state.error);
    }
    clearActivationTimeout();
    setOperation(null);
    return;
  }

  // Only trust events reported by the tab this popup is bound to — another
  // tab's content script must not be able to flip this popup's UI state.
  if (sender.tab?.id !== currentTabId) return;

  switch (message.type) {
    case "EDITOR_ACTIVATED": {
      // Page acknowledgement is intentionally not a UI success signal. The
      // service worker will emit SESSION_STATE_CHANGED after promotion.
      if (operation === "enabling") setProgress("Confirming activation…");
      break;
    }

    case "EDITOR_DEACTIVATED":
      // The authoritative service-worker notification follows revocation.
      break;

    case "STATUS_RESPONSE":
      updateStatus(message.payload as StatusResponsePayload);
      break;
  }
});

init();
