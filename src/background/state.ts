/**
 * Service-worker state in chrome.storage.session.
 *
 * Every tab gets its own storage keys (`comvi_session_<tabId>`,
 * `comvi_tabstate_<tabId>`, `comvi_navgen_<tabId>`) so concurrent activity on
 * different tabs never read-modify-writes a shared record. Mutations of the
 * same key are additionally serialized through a per-key promise queue —
 * MV3 event handlers interleave, and a lost update on a session record would
 * be an authorization bug, not just a UI glitch.
 *
 * storage.session survives service-worker restarts but dies with the browser,
 * which is exactly the lifetime session authority should have.
 */

export type SessionStatus = "pending" | "active";

/** A proxy session created by the popup via START_SESSION. */
export interface SessionRecord {
  status: SessionStatus;
  /** Canonical page origin the session is bound to. */
  origin: string;
  apiKey: string;
  /** Project id captured during key validation. */
  projectId?: string | number;
  /** User's explicit telemetry opt-in for this session. */
  collectContext: boolean;
  /** Single-use activation nonce; travels popup -> bridge -> SW, never the page. */
  nonce: string;
  /** Popup Port lease that owns a pending activation. */
  popupLeaseId: string;
  /** Document identity bound at activation (Chrome >= 106 senders). */
  documentId?: string;
  /** Per-tab navigation generation the session was created under. */
  navGen: number;
  /** Deadline (epoch ms) for pending sessions; 0 once active. */
  expiresAt: number;
}

/** Detection metadata for icon rendering — never used for authorization. */
export interface TabState {
  comviDetected: boolean;
  version?: string;
}

const SESSION_PREFIX = "comvi_session_";
const TABSTATE_PREFIX = "comvi_tabstate_";
const NAVGEN_PREFIX = "comvi_navgen_";
const AUTHORITY_EPOCH_KEY = "comvi_authority_epoch";

export const sessionKey = (tabId: number) => `${SESSION_PREFIX}${tabId}`;
export const tabLockKey = (tabId: number) => `comvi_tab_lock_${tabId}`;
export const authorityLockKey = "comvi_authority_lock";
const tabStateKey = (tabId: number) => `${TABSTATE_PREFIX}${tabId}`;
const navGenKey = (tabId: number) => `${NAVGEN_PREFIX}${tabId}`;

// --- per-key mutation queue ---

const locks = new Map<string, Promise<unknown>>();

/** Serialize mutations touching the same logical key. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

// --- sessions ---

export async function getSession(tabId: number): Promise<SessionRecord | undefined> {
  const key = sessionKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] as SessionRecord | undefined;
}

export async function putSession(tabId: number, record: SessionRecord): Promise<void> {
  await chrome.storage.session.set({ [sessionKey(tabId)]: record });
}

export async function deleteSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove(sessionKey(tabId));
}

/** Enumerate all sessions (used by credential revocation). */
export async function getAllSessions(): Promise<Map<number, SessionRecord>> {
  const everything = await chrome.storage.session.get(null);
  const sessions = new Map<number, SessionRecord>();
  for (const [key, value] of Object.entries(everything)) {
    if (key.startsWith(SESSION_PREFIX)) {
      const tabId = Number(key.slice(SESSION_PREFIX.length));
      if (Number.isInteger(tabId)) sessions.set(tabId, value as SessionRecord);
    }
  }
  return sessions;
}

// --- tab detection state (icon only) ---

export async function getTabState(tabId: number): Promise<TabState | undefined> {
  const key = tabStateKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] as TabState | undefined;
}

export async function putTabState(tabId: number, state: TabState): Promise<void> {
  await chrome.storage.session.set({ [tabStateKey(tabId)]: state });
}

export async function deleteTabState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tabStateKey(tabId));
}

// --- navigation generation ---

export async function getNavGen(tabId: number): Promise<number> {
  const key = navGenKey(tabId);
  const result = await chrome.storage.session.get(key);
  const value = result[key];
  return typeof value === "number" ? value : 0;
}

/** Bump on every top-level navigation; invalidates sessions created before it. */
export async function bumpNavGen(tabId: number): Promise<number> {
  return withLock(navGenKey(tabId), async () => {
    const next = (await getNavGen(tabId)) + 1;
    await chrome.storage.session.set({ [navGenKey(tabId)]: next });
    return next;
  });
}

export async function deleteNavGen(tabId: number): Promise<void> {
  await chrome.storage.session.remove(navGenKey(tabId));
}

export async function getAuthorityEpoch(): Promise<number> {
  const result = await chrome.storage.session.get(AUTHORITY_EPOCH_KEY);
  const value = result[AUTHORITY_EPOCH_KEY];
  return typeof value === "number" ? value : 0;
}

/** Invalidate every START_SESSION operation already in flight. */
export async function bumpAuthorityEpoch(): Promise<number> {
  const next = (await getAuthorityEpoch()) + 1;
  await chrome.storage.session.set({ [AUTHORITY_EPOCH_KEY]: next });
  return next;
}
