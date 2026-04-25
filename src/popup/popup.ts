/**
 * Popup script for the Chrome extension
 * Supports per-origin credentials and API key validation
 */

import {
  getCredentials,
  setCredentials,
  clearCredentials,
  getGlobalSettings,
  getOriginFromUrl,
  type OriginCredentials,
} from "../shared/storage";
import type { Message, StatusResponsePayload, ActivatePayload } from "../shared/messages";

// DOM Elements
const statusIndicator = document.getElementById("status-indicator")!;
const statusText = document.getElementById("status-text")!;
const versionEl = document.getElementById("version")!;
const originTextEl = document.getElementById("origin-text")!;
const notDetectedEl = document.getElementById("not-detected")!;
const settingsEl = document.getElementById("settings")!;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const toggleVisibilityBtn = document.getElementById("toggle-visibility")!;
const toggleEditorBtn = document.getElementById("toggle-editor") as HTMLButtonElement;
const clearCredentialsBtn = document.getElementById("clear-credentials")!;
const errorEl = document.getElementById("error")!;

// Validation elements
const validationStatusEl = document.getElementById("validation-status")!;
const validationSpinnerEl = document.getElementById("validation-spinner")!;
const validationIconEl = document.getElementById("validation-icon")!;
const validationTextEl = document.getElementById("validation-text")!;

// State
let currentTabId: number | null = null;
let currentOrigin: string = "";
let editorActive = false;
let comviDetected = false;
let validationTimeout: ReturnType<typeof setTimeout> | null = null;
let isValidated = false;

// Initialize
async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    showError("Cannot access current tab");
    return;
  }
  currentTabId = tab.id;
  currentOrigin = getOriginFromUrl(tab.url);

  // Show current origin
  originTextEl.textContent = currentOrigin || "Unknown origin";

  // Load saved credentials for this origin
  const credentials = await getCredentials(currentOrigin);
  if (credentials) {
    apiKeyInput.value = credentials.apiKey;
    if (credentials.validated && credentials.projectName) {
      showValidationSuccess(credentials.projectName);
    }
    clearCredentialsBtn.classList.remove("hidden");
  }

  // Request status from content script
  requestStatus();

  // Set up event listeners
  setupEventListeners();
}

function setupEventListeners() {
  // Toggle API key visibility
  toggleVisibilityBtn.addEventListener("click", () => {
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
  });

  // Validate API key on input (debounced)
  apiKeyInput.addEventListener("input", () => {
    const apiKey = apiKeyInput.value.trim();

    // Clear previous validation
    resetValidation();

    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    if (!apiKey) {
      hideValidation();
      toggleEditorBtn.disabled = true;
      return;
    }

    // Debounce validation
    validationTimeout = setTimeout(() => {
      validateApiKey(apiKey);
    }, 500);
  });

  // Clear credentials
  clearCredentialsBtn.addEventListener("click", async () => {
    if (!currentOrigin) return;

    await clearCredentials(currentOrigin);
    apiKeyInput.value = "";
    resetValidation();
    hideValidation();
    toggleEditorBtn.disabled = true;
    clearCredentialsBtn.classList.add("hidden");

    // Deactivate if active
    if (editorActive && currentTabId) {
      await sendToContentScript({ type: "DEACTIVATE_EDITOR" });
    }
  });

  // Toggle editor
  toggleEditorBtn.addEventListener("click", async () => {
    if (!currentTabId || !currentOrigin) return;

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey && !editorActive) {
      showError("Please enter an API key");
      return;
    }

    hideError();
    toggleEditorBtn.disabled = true;

    if (editorActive) {
      // Deactivate
      await sendToContentScript({ type: "DEACTIVATE_EDITOR" });
    } else {
      // Save credentials before activating
      const credentials: OriginCredentials = {
        apiKey,
        validated: isValidated,
        projectName: validationTextEl.textContent || undefined,
      };
      await setCredentials(currentOrigin, credentials);
      clearCredentialsBtn.classList.remove("hidden");

      // Activate
      const settings = await getGlobalSettings();
      const scriptUrl = await ensureEditorRuntimeLoaded(settings.scriptUrl);
      const payload: ActivatePayload = {
        apiKey,
        scriptUrl,
        apiBaseUrl: settings.apiBaseUrl,
      };
      await sendToContentScript({ type: "ACTIVATE_EDITOR", payload });
    }

    // Re-enable button after a short delay
    setTimeout(() => {
      toggleEditorBtn.disabled = false;
    }, 1000);
  });
}

async function ensureEditorRuntimeLoaded(scriptUrl: string): Promise<string> {
  if (scriptUrl.includes("://")) {
    return scriptUrl;
  }

  if (!currentTabId) {
    throw new Error("No tab ID");
  }

  await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    files: [scriptUrl],
    world: "MAIN",
  });

  return chrome.runtime.getURL(scriptUrl);
}

async function validateApiKey(apiKey: string) {
  showValidating();

  try {
    // TODO: Replace with actual Comvi API endpoint when available
    // For now, we'll do basic validation (non-empty, reasonable format)
    // In production: const response = await fetch(`${API_URL}/api/v1/api-keys/current?ak=${apiKey}`);

    // Simulate API validation (remove this when real API is available)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Basic format validation
    if (apiKey.length < 10) {
      showValidationError("API key too short");
      return;
    }

    // For now, accept any key that looks reasonable
    // When API is available, this will validate against the server
    showValidationSuccess("API key accepted");
    isValidated = true;
    toggleEditorBtn.disabled = !comviDetected;

    // Save validated credentials
    if (currentOrigin) {
      await setCredentials(currentOrigin, {
        apiKey,
        validated: true,
        projectName: "API key accepted",
      });
      clearCredentialsBtn.classList.remove("hidden");
    }
  } catch {
    showValidationError("Validation failed");
  }
}

function showValidating() {
  validationStatusEl.classList.remove("hidden");
  validationSpinnerEl.classList.remove("hidden");
  validationIconEl.classList.add("hidden");
  validationTextEl.textContent = "Validating...";
  validationTextEl.className = "validation-text";
  apiKeyInput.classList.remove("valid", "invalid");
}

function showValidationSuccess(message: string) {
  validationStatusEl.classList.remove("hidden");
  validationSpinnerEl.classList.add("hidden");
  validationIconEl.classList.remove("hidden");
  validationIconEl.className = "validation-icon valid";
  validationTextEl.textContent = message;
  validationTextEl.className = "validation-text valid";
  apiKeyInput.classList.remove("invalid");
  apiKeyInput.classList.add("valid");
  isValidated = true;
  toggleEditorBtn.disabled = !comviDetected;
}

function showValidationError(message: string) {
  validationStatusEl.classList.remove("hidden");
  validationSpinnerEl.classList.add("hidden");
  validationIconEl.classList.remove("hidden");
  validationIconEl.className = "validation-icon invalid";
  validationTextEl.textContent = message;
  validationTextEl.className = "validation-text invalid";
  apiKeyInput.classList.remove("valid");
  apiKeyInput.classList.add("invalid");
  isValidated = false;
  toggleEditorBtn.disabled = true;
}

function resetValidation() {
  isValidated = false;
  apiKeyInput.classList.remove("valid", "invalid");
}

function hideValidation() {
  validationStatusEl.classList.add("hidden");
}

async function requestStatus() {
  if (!currentTabId) return;

  try {
    const response = await sendToContentScript({ type: "GET_STATUS" });
    if (response?.payload) {
      updateUI(response.payload as StatusResponsePayload);
    }
  } catch {
    // Content script might not be ready yet
    console.log("Waiting for content script...");
    setTimeout(requestStatus, 500);
  }
}

function updateUI(status: StatusResponsePayload) {
  comviDetected = status.comviDetected;
  editorActive = status.editorActive ?? false;

  // Update status indicator
  statusIndicator.className = "status-indicator";
  if (editorActive) {
    statusIndicator.classList.add("active");
    statusText.textContent = "Editor active";
  } else if (comviDetected) {
    statusIndicator.classList.add("detected");
    statusText.textContent = "Comvi i18n detected";
  } else {
    statusIndicator.classList.add("not-found");
    statusText.textContent = "Comvi i18n not found";
  }

  // Update version
  if (status.version) {
    versionEl.textContent = `v${status.version}`;
  }

  // Show/hide sections
  if (comviDetected) {
    notDetectedEl.classList.add("hidden");
    settingsEl.classList.remove("hidden");

    // Update button state
    const hasApiKey = apiKeyInput.value.trim().length > 0;
    toggleEditorBtn.disabled = !hasApiKey || (!isValidated && !editorActive);

    if (editorActive) {
      toggleEditorBtn.textContent = "Disable Editor";
      toggleEditorBtn.classList.add("active");
      toggleEditorBtn.disabled = false;
    } else {
      toggleEditorBtn.textContent = "Enable Editor";
      toggleEditorBtn.classList.remove("active");
    }
  } else {
    notDetectedEl.classList.remove("hidden");
    settingsEl.classList.add("hidden");
  }
}

async function sendToContentScript(message: Message): Promise<any> {
  if (!currentTabId) throw new Error("No tab ID");

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

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function hideError() {
  errorEl.classList.add("hidden");
}

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message: Message) => {
  switch (message.type) {
    case "EDITOR_ACTIVATED":
      editorActive = true;
      updateUI({ comviDetected: true, editorActive: true });
      break;

    case "EDITOR_DEACTIVATED":
      editorActive = false;
      updateUI({ comviDetected: true, editorActive: false });
      break;

    case "STATUS_RESPONSE":
      updateUI(message.payload as StatusResponsePayload);
      break;
  }
});

// Start
init();
