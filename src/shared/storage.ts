/**
 * Storage utilities for Chrome extension
 */

export interface ExtensionSettings {
  apiKey: string;
  cdnUrl: string;
  enabled: boolean;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: "",
  cdnUrl: "https://unpkg.com/@tolkie/plugin-in-context-editor@latest/dist/standalone.iife.js",
  enabled: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return result as ExtensionSettings;
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.local.set(settings);
}

export async function getApiKey(): Promise<string> {
  const settings = await getSettings();
  return settings.apiKey;
}

export async function setApiKey(apiKey: string): Promise<void> {
  await saveSettings({ apiKey });
}

export async function isEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.enabled;
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await saveSettings({ enabled });
}
