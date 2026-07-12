/**
 * Storage utilities for Chrome extension
 * Stores credentials per-origin for multi-project support
 *
 * Keys are persisted only after the service worker has validated them
 * against the API, and can be removed by the user from the popup
 * ("Forget key"). The API base URL is fixed at build time (shared/config.ts)
 * and is intentionally not a stored setting.
 */

export interface OriginCredentials {
  apiKey: string;
  validated?: boolean;
}

const CREDENTIALS_KEY = "comvi_credentials";
export const STORAGE_SCHEMA_KEY = "comvi_storage_schema";
export const CURRENT_STORAGE_SCHEMA_VERSION = 1;

let credentialMutation: Promise<unknown> = Promise.resolve();

function mutateCredentials<T>(
  mutation: (store: Record<string, OriginCredentials>) => T,
): Promise<T> {
  const next = credentialMutation.catch(() => {}).then(async () => {
    const result = await chrome.storage.local.get([CREDENTIALS_KEY, STORAGE_SCHEMA_KEY]);
    const compatible = result[STORAGE_SCHEMA_KEY] === CURRENT_STORAGE_SCHEMA_VERSION;
    const store = compatible
      ? {
          ...((result[CREDENTIALS_KEY] as Record<string, OriginCredentials> | undefined) ?? {}),
        }
      : {};
    const value = mutation(store);
    await chrome.storage.local.set({
      [CREDENTIALS_KEY]: store,
      [STORAGE_SCHEMA_KEY]: CURRENT_STORAGE_SCHEMA_VERSION,
    });
    return value;
  });
  credentialMutation = next;
  return next;
}

// --- Per-origin credentials ---

export async function getCredentials(origin: string): Promise<OriginCredentials | null> {
  const result = await chrome.storage.local.get([CREDENTIALS_KEY, STORAGE_SCHEMA_KEY]);
  if (result[STORAGE_SCHEMA_KEY] !== CURRENT_STORAGE_SCHEMA_VERSION) return null;
  const store = result[CREDENTIALS_KEY] as Record<string, OriginCredentials> | undefined;
  return store?.[origin] ?? null;
}

export async function setCredentials(origin: string, creds: OriginCredentials): Promise<void> {
  await mutateCredentials((store) => {
    store[origin] = creds;
  });
}

export async function clearCredentials(origin: string): Promise<void> {
  await mutateCredentials((store) => {
    delete store[origin];
  });
}

/**
 * Remove an origin and every credential entry sharing its API key in one
 * serialized read-modify-write. Returns the captured key for session
 * revocation, without exposing it outside the service worker.
 */
export async function clearCredentialFamily(origin: string): Promise<string | undefined> {
  return mutateCredentials((store) => {
    const apiKey = store[origin]?.apiKey;
    delete store[origin];
    if (apiKey) {
      for (const [storedOrigin, credential] of Object.entries(store)) {
        if (credential.apiKey === apiKey) delete store[storedOrigin];
      }
    }
    return apiKey;
  });
}

export async function getAllCredentials(): Promise<Record<string, OriginCredentials>> {
  const result = await chrome.storage.local.get([CREDENTIALS_KEY, STORAGE_SCHEMA_KEY]);
  if (result[STORAGE_SCHEMA_KEY] !== CURRENT_STORAGE_SCHEMA_VERSION) return {};
  return (result[CREDENTIALS_KEY] as Record<string, OriginCredentials>) || {};
}

/**
 * Initialize or migrate credential storage. Unknown schema versions are
 * cleared fail-closed; unrelated local preferences are preserved.
 */
export function ensureStorageSchema(): Promise<boolean> {
  const next = credentialMutation.catch(() => {}).then(async () => {
    const result = await chrome.storage.local.get(STORAGE_SCHEMA_KEY);
    if (result[STORAGE_SCHEMA_KEY] === CURRENT_STORAGE_SCHEMA_VERSION) return false;
    await chrome.storage.local.set({
      [CREDENTIALS_KEY]: {},
      [STORAGE_SCHEMA_KEY]: CURRENT_STORAGE_SCHEMA_VERSION,
    });
    return true;
  });
  credentialMutation = next;
  return next;
}

// --- Helpers ---

export function getOriginFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
