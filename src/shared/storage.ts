/**
 * Storage utilities for Chrome extension
 * Stores credentials per-origin for multi-project support
 */

export interface OriginCredentials {
  apiKey: string;
  apiUrl?: string;
  projectName?: string; // Cached from validation
  validated?: boolean;
}

export interface GlobalSettings {
  scriptUrl: string;
  apiBaseUrl: string;
}

const CREDENTIALS_KEY = "comvi_credentials";
const SETTINGS_KEY = "comvi_settings";
// Required at build time by vite.config.ts.
const DEFAULT_API_BASE_URL = import.meta.env.VITE_COMVI_API_BASE_URL as string;
const DEFAULT_SCRIPT_URL = import.meta.env.VITE_COMVI_EDITOR_SCRIPT_URL as string;

const DEFAULT_SETTINGS: GlobalSettings = {
  scriptUrl: DEFAULT_SCRIPT_URL,
  apiBaseUrl: DEFAULT_API_BASE_URL,
};

// --- Per-origin credentials ---

export async function getCredentials(origin: string): Promise<OriginCredentials | null> {
  const result = await chrome.storage.local.get(CREDENTIALS_KEY);
  const store = result[CREDENTIALS_KEY] as Record<string, OriginCredentials> | undefined;
  return store?.[origin] ?? null;
}

export async function setCredentials(origin: string, creds: OriginCredentials): Promise<void> {
  const result = await chrome.storage.local.get(CREDENTIALS_KEY);
  const store = (result[CREDENTIALS_KEY] as Record<string, OriginCredentials>) || {};
  store[origin] = creds;
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: store });
}

export async function clearCredentials(origin: string): Promise<void> {
  const result = await chrome.storage.local.get(CREDENTIALS_KEY);
  const store = (result[CREDENTIALS_KEY] as Record<string, OriginCredentials>) || {};
  delete store[origin];
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: store });
}

export async function getAllCredentials(): Promise<Record<string, OriginCredentials>> {
  const result = await chrome.storage.local.get(CREDENTIALS_KEY);
  return (result[CREDENTIALS_KEY] as Record<string, OriginCredentials>) || {};
}

// --- Global settings ---

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as GlobalSettings | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
  };
}

export async function saveGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
  const current = await getGlobalSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}

// --- Helpers ---

export function getOriginFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
