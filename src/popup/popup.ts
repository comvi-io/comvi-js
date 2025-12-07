/**
 * Popup script for the Chrome extension
 */

import { getSettings, saveSettings } from "../shared/storage";
import type { Message, StatusResponsePayload, ActivatePayload } from "../shared/messages";

// DOM Elements
const statusIndicator = document.getElementById("status-indicator")!;
const statusText = document.getElementById("status-text")!;
const versionEl = document.getElementById("version")!;
const notDetectedEl = document.getElementById("not-detected")!;
const settingsEl = document.getElementById("settings")!;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const toggleVisibilityBtn = document.getElementById("toggle-visibility")!;
const toggleEditorBtn = document.getElementById("toggle-editor")!;
const errorEl = document.getElementById("error")!;

// State
let currentTabId: number | null = null;
let editorActive = false;
let tolkieDetected = false;

// Initialize
async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError("Cannot access current tab");
    return;
  }
  currentTabId = tab.id;

  // Load saved settings
  const settings = await getSettings();
  apiKeyInput.value = settings.apiKey;

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

  // Save API key on change
  apiKeyInput.addEventListener("change", async () => {
    await saveSettings({ apiKey: apiKeyInput.value.trim() });
  });

  // Toggle editor
  toggleEditorBtn.addEventListener("click", async () => {
    if (!currentTabId) return;

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
      // Activate
      const settings = await getSettings();
      const payload: ActivatePayload = {
        apiKey,
        cdnUrl: settings.cdnUrl,
      };
      await sendToContentScript({ type: "ACTIVATE_EDITOR", payload });
    }

    // Re-enable button after a short delay
    setTimeout(() => {
      toggleEditorBtn.disabled = false;
    }, 1000);
  });
}

async function requestStatus() {
  if (!currentTabId) return;

  try {
    const response = await sendToContentScript({ type: "GET_STATUS" });
    if (response?.payload) {
      updateUI(response.payload as StatusResponsePayload);
    }
  } catch (error) {
    // Content script might not be ready yet
    console.log("Waiting for content script...");
    setTimeout(requestStatus, 500);
  }
}

function updateUI(status: StatusResponsePayload) {
  tolkieDetected = status.tolkieDetected;
  editorActive = status.editorActive ?? false;

  // Update status indicator
  statusIndicator.className = "status-indicator";
  if (editorActive) {
    statusIndicator.classList.add("active");
    statusText.textContent = "Editor active";
  } else if (tolkieDetected) {
    statusIndicator.classList.add("detected");
    statusText.textContent = "Tolkie SDK detected";
  } else {
    statusIndicator.classList.add("not-found");
    statusText.textContent = "SDK not found";
  }

  // Update version
  if (status.version) {
    versionEl.textContent = `v${status.version}`;
  }

  // Show/hide sections
  if (tolkieDetected) {
    notDetectedEl.classList.add("hidden");
    settingsEl.classList.remove("hidden");

    // Update button state
    toggleEditorBtn.disabled = false;
    if (editorActive) {
      toggleEditorBtn.textContent = "Disable Editor";
      toggleEditorBtn.classList.add("active");
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
      updateUI({ tolkieDetected: true, editorActive: true });
      break;

    case "EDITOR_DEACTIVATED":
      editorActive = false;
      updateUI({ tolkieDetected: true, editorActive: false });
      break;

    case "STATUS_RESPONSE":
      updateUI(message.payload as StatusResponsePayload);
      break;
  }
});

// Start
init();
