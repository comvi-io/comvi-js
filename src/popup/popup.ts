import "./popup.css";
import {
  getCredentials,
  setCredentials,
  getGlobalSettings,
  getOriginFromUrl,
} from "../shared/storage";
import type { Message, StatusResponsePayload, ActivatePayload } from "../shared/messages";

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
const enableBtn = document.getElementById("enable-btn") as HTMLButtonElement;
const disableBtn = document.getElementById("disable-btn") as HTMLButtonElement;
const errorMsg = document.getElementById("error-msg")!;
const versionLine = document.getElementById("version-line")!;

// State
let currentTabId: number | null = null;
let currentOrigin = "";
let editorActive = false;
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
  comviDetected = status.comviDetected;
  editorActive = status.editorActive ?? false;
  if (status.version) comviVersion = status.version;
  render();
}

// --- Actions ---

async function handleEnable() {
  if (!currentTabId || !currentOrigin) return;

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError("Please enter an API key");
    apiKeyInput.focus();
    return;
  }

  hideError();
  enableBtn.disabled = true;
  enableBtn.textContent = "Enabling…";

  try {
    const settings = await getGlobalSettings();
    const payload: ActivatePayload = {
      apiKey,
      scriptUrl: settings.scriptUrl,
      apiBaseUrl: settings.apiBaseUrl,
    };
    await sendToContentScript({ type: "ACTIVATE_EDITOR", payload });
    await setCredentials(currentOrigin, { apiKey });
  } catch (err) {
    showError(err instanceof Error ? err.message : "Failed to enable editor");
    enableBtn.disabled = false;
    enableBtn.textContent = "Enable editor";
  }
}

async function handleDisable() {
  if (!currentTabId) return;

  disableBtn.disabled = true;
  disableBtn.textContent = "Disabling…";

  try {
    await sendToContentScript({ type: "DEACTIVATE_EDITOR" });
  } catch {
    disableBtn.disabled = false;
    disableBtn.textContent = "Disable editor";
  }
}

// --- Init ---

async function init() {
  await initTheme();

  // Render not-detected up front so the popup never shows blank,
  // even before the content script replies (or if it never can).
  render();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  currentTabId = tab.id;
  currentOrigin = getOriginFromUrl(tab.url);

  const credentials = await getCredentials(currentOrigin);
  if (credentials?.apiKey) apiKeyInput.value = credentials.apiKey;

  enableBtn.addEventListener("click", handleEnable);
  disableBtn.addEventListener("click", handleDisable);
  apiKeyInput.addEventListener("input", hideError);
  apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleEnable();
  });

  requestStatus();
}

chrome.runtime.onMessage.addListener((message: Message) => {
  switch (message.type) {
    case "EDITOR_ACTIVATED": {
      const detail = (message.payload ?? {}) as { success?: boolean; error?: string };
      enableBtn.disabled = false;
      enableBtn.textContent = "Enable editor";
      if (detail.success) {
        editorActive = true;
        hideError();
      } else {
        editorActive = false;
        if (detail.error) showError(detail.error);
      }
      render();
      break;
    }

    case "EDITOR_DEACTIVATED":
      editorActive = false;
      disableBtn.disabled = false;
      disableBtn.textContent = "Disable editor";
      render();
      break;

    case "STATUS_RESPONSE":
      updateStatus(message.payload as StatusResponsePayload);
      break;
  }
});

init();
