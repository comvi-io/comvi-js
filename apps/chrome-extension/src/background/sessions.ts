/**
 * Proxy-session state machine.
 *
 * Lifecycle: START_SESSION (popup) creates a short-lived *pending* record
 * after the API key validates AND the tab still shows the same canonical
 * origin. The session becomes *active* only when the bridge relays an
 * activation acknowledgement carrying the single-use nonce that travelled
 * popup -> bridge over extension messaging (the page never sees it). Every
 * failure path — validation error, navigation during validation, activation
 * failure, deadline expiry, deactivation, tab close, credential removal —
 * deletes the record, so authority fails closed.
 *
 * The acknowledgement itself is page-forgeable (any page script can dispatch
 * the DOM event the bridge relays), so it is treated as a readiness signal
 * only: it can promote a pending session that the user just created for that
 * exact tab/origin, nothing else. Actual authority stays constrained by the
 * route contract, origin, document identity and navigation generation.
 */

import { canonicalizeOrigin, canonicalizePageOrigin } from "../shared/origins";
import { clearCredentialFamily, setCredentials } from "../shared/storage";
import { API_BASE_URL } from "../shared/config";
import type {
  StartSessionPayload,
  StartSessionResponse,
  SessionStatusResponse,
} from "../shared/messages";
import {
  withLock,
  tabLockKey,
  authorityLockKey,
  getSession,
  putSession,
  deleteSession,
  getAllSessions,
  getTabState,
  getNavGen,
  getAuthorityEpoch,
  bumpAuthorityEpoch,
  type SessionRecord,
} from "./state";
import { renderBadge } from "./badge";
import {
  beginGlobalProxyRevocation,
  beginTabProxyRevocation,
  endGlobalProxyRevocation,
  endTabProxyRevocation,
  notifyProxySessionTransition,
} from "./proxy-work";

/** How long a pending session may wait for activation acknowledgement. */
export const PENDING_TTL_MS = 30_000;
const KEY_VALIDATION_TIMEOUT_MS = 8_000;

// --- API key validation ---

interface KeyValidationResult {
  ok: boolean;
  error?: string;
  projectId?: string | number;
}

/**
 * Validate an API key against the fixed API origin before opening a session
 * or persisting credentials. Mirrors fetch-loader's project lookup
 * (canonical path, then legacy deployment path) and captures the project id
 * that export routes are later bound to.
 */
async function validateApiKey(apiKey: string): Promise<KeyValidationResult> {
  const paths = ["/v1/project", "/api/v1/api/project"];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KEY_VALIDATION_TIMEOUT_MS);

  try {
    for (const path of paths) {
      let response: Response;
      try {
        response = await fetch(API_BASE_URL + path, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
      } catch {
        return controller.signal.aborted
          ? { ok: false, error: "The Comvi API did not respond in time. Try again." }
          : { ok: false, error: "Could not reach the Comvi API. Check your connection." };
      }

      if (response.ok) {
        let projectId: string | number | undefined;
        try {
          const info = (await response.json()) as { id?: unknown };
          if (typeof info.id === "string" || typeof info.id === "number") projectId = info.id;
        } catch {
          // Tolerate a non-JSON success body; export routes will stay unbound
          // (and therefore denied) without a project id.
        }
        return { ok: true, projectId };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "Invalid API key" };
      }
      if (response.status !== 404) {
        return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return { ok: false, error: "Comvi API endpoint not found" };
}

// --- helpers ---

async function tabOrigin(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return canonicalizePageOrigin(tab.url);
  } catch {
    return null;
  }
}

function isExpired(session: SessionRecord, now: number): boolean {
  return session.status === "pending" && session.expiresAt !== 0 && now > session.expiresAt;
}

/** Read the session for a tab, deleting and hiding it when expired. */
export async function getLiveSession(tabId: number): Promise<SessionRecord | undefined> {
  const session = await getSession(tabId);
  if (!session) return undefined;
  if (isExpired(session, Date.now())) {
    await revokeSession(tabId);
    return undefined;
  }
  return session;
}

/** Remove expired pending records when the MV3 worker starts or wakes. */
export async function sweepExpiredPendingSessions(now = Date.now()): Promise<number> {
  const sessions = await getAllSessions();
  let removed = 0;
  for (const [tabId, session] of sessions) {
    if (!isExpired(session, now)) continue;
    await revokeSession(tabId);
    removed += 1;
  }
  return removed;
}

async function expirePendingSession(tabId: number, nonce: string): Promise<void> {
  await withLock(tabLockKey(tabId), async () => {
    const session = await getSession(tabId);
    if (
      !session ||
      session.status !== "pending" ||
      session.nonce !== nonce ||
      !isExpired(session, Date.now())
    ) {
      return;
    }
    await deleteSession(tabId);
    notifyProxySessionTransition(tabId);
    const tabState = await getTabState(tabId);
    renderBadge(tabId, tabState?.comviDetected ?? false, false);
  });
}

function schedulePendingExpiry(tabId: number, session: SessionRecord): void {
  const delay = Math.max(0, session.expiresAt - Date.now() + 1);
  const timer = setTimeout(() => {
    // MV3 may suspend this timer; the startup sweep is the durable fallback.
    void expirePendingSession(tabId, session.nonce).catch(() => {});
  }, delay);

  // Do not keep Node-based test/build processes alive for a browser timer.
  const nodeTimer = timer as unknown as { unref?: () => void };
  nodeTimer.unref?.();
}

// --- lifecycle operations ---

export async function startSession(
  payload: unknown,
  sender: chrome.runtime.MessageSender,
  isPopupLeaseActive: (leaseId: string) => boolean = () => true,
): Promise<StartSessionResponse> {
  // Only extension pages (the popup) may open sessions — never content
  // scripts, which relay page-controlled input.
  if (sender.tab) {
    return { ok: false, error: "Not allowed" };
  }

  const { tabId, origin, apiKey, popupLeaseId } = (payload ?? {}) as Partial<StartSessionPayload>;
  if (
    typeof tabId !== "number" ||
    !Number.isInteger(tabId) ||
    typeof apiKey !== "string" ||
    apiKey.length === 0 ||
    apiKey.length > 512 ||
    typeof popupLeaseId !== "string" ||
    popupLeaseId.length < 16 ||
    popupLeaseId.length > 128 ||
    !isPopupLeaseActive(popupLeaseId)
  ) {
    return { ok: false, error: "Malformed session request" };
  }

  const canonicalOrigin = canonicalizeOrigin(origin);
  if (!canonicalOrigin) {
    return { ok: false, error: "The editor can only be enabled on secure (https) pages" };
  }

  // Identity snapshot before the slow network validation.
  const navGenBefore = await getNavGen(tabId);
  const authorityEpochBefore = await getAuthorityEpoch();
  const originBefore = await tabOrigin(tabId);
  if (originBefore !== canonicalOrigin) {
    return { ok: false, error: "The page changed. Close and reopen the popup." };
  }

  const validation = await validateApiKey(apiKey);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // Re-verify identity after validation: a navigation while we were waiting
  // must not let the new document inherit this session.
  const navGenAfter = await getNavGen(tabId);
  const originAfter = await tabOrigin(tabId);
  if (navGenAfter !== navGenBefore || originAfter !== canonicalOrigin) {
    return { ok: false, error: "The page navigated while validating. Try again." };
  }

  // Linearize credential persistence and session creation against Forget.
  // The epoch invalidates validation that began before any credential purge.
  return withLock(authorityLockKey, () =>
    withLock(tabLockKey(tabId), async () => {
      if (
        (await getAuthorityEpoch()) !== authorityEpochBefore ||
        (await getNavGen(tabId)) !== navGenAfter ||
        (await tabOrigin(tabId)) !== canonicalOrigin ||
        !isPopupLeaseActive(popupLeaseId)
      ) {
        return { ok: false, error: "The page or popup changed while validating. Try again." };
      }

      const nonce = crypto.randomUUID();
      const record: SessionRecord = {
        status: "pending",
        origin: canonicalOrigin,
        apiKey,
        projectId: validation.projectId,
        // Pending sessions have no proxy authority. The effective value is
        // supplied by the SDK activation result when the session is promoted.
        collectContext: false,
        nonce,
        popupLeaseId,
        navGen: navGenAfter,
        expiresAt: Date.now() + PENDING_TTL_MS,
      };
      await putSession(tabId, record);
      await setCredentials(canonicalOrigin, { apiKey, validated: true });
      // Port disconnect may interleave at either storage await above. In that
      // case its revoker either removed the record already, or this check does.
      if (!isPopupLeaseActive(popupLeaseId)) {
        await deleteSession(tabId);
        notifyProxySessionTransition(tabId);
        return { ok: false, error: "The popup closed while validating. Try again." };
      }
      schedulePendingExpiry(tabId, record);
      return { ok: true, nonce };
    }),
  );
}

/**
 * Promote a pending session on an activation acknowledgement from the bridge.
 * Returns whether the session is now active.
 */
export async function confirmActivation(
  tabId: number,
  sender: chrome.runtime.MessageSender,
  nonce: unknown,
  effectiveCollectContext: unknown,
  isPopupLeaseActive: (leaseId: string) => boolean,
): Promise<boolean> {
  return withLock(tabLockKey(tabId), async () => {
    const session = await getSession(tabId);
    if (!session || session.status !== "pending") return false;
    if (isExpired(session, Date.now())) {
      await deleteSession(tabId);
      notifyProxySessionTransition(tabId);
      return false;
    }
    if (typeof nonce !== "string" || nonce !== session.nonce) return false;
    if (!isPopupLeaseActive(session.popupLeaseId)) {
      await deleteSession(tabId);
      notifyProxySessionTransition(tabId);
      return false;
    }
    if (sender.tab?.id !== tabId) return false;
    if (sender.frameId !== 0) return false;
    if (canonicalizeOrigin(sender.origin) !== session.origin) return false;
    if ((await getNavGen(tabId)) !== session.navGen) return false;
    if ((await tabOrigin(tabId)) !== session.origin) return false;

    const promoted: SessionRecord = {
      ...session,
      status: "active",
      // The editor derives this value from the site's i18n.collectContext
      // option. Keep telemetry routes closed unless activation reports true.
      collectContext: effectiveCollectContext === true,
      expiresAt: 0,
      // Bind the acknowledging document; every proxy request must come from it.
      documentId: sender.documentId,
    };
    await putSession(tabId, promoted);
    notifyProxySessionTransition(tabId);

    const tabState = await getTabState(tabId);
    renderBadge(tabId, tabState?.comviDetected ?? true, true);
    return true;
  });
}

/** Roll back a pending session whose activation failed (nonce required). */
export async function rollbackPending(tabId: number, nonce: unknown): Promise<void> {
  await withLock(tabLockKey(tabId), async () => {
    const session = await getSession(tabId);
    if (!session || session.status !== "pending") return;
    if (typeof nonce !== "string" || nonce !== session.nonce) return;
    await deleteSession(tabId);
    notifyProxySessionTransition(tabId);
  });
}

/** Revoke any session for the tab and reflect it in the badge immediately. */
export async function revokeSession(tabId: number): Promise<void> {
  beginTabProxyRevocation(tabId);
  try {
    await withLock(tabLockKey(tabId), async () => {
      await deleteSession(tabId);
      const tabState = await getTabState(tabId);
      renderBadge(tabId, tabState?.comviDetected ?? false, false);
    });
  } finally {
    endTabProxyRevocation(tabId);
  }
}

/**
 * Validate an editor lifecycle deactivation and revoke under one gated tab
 * transition. The gate is raised synchronously before any storage read, so a
 * proxy request cannot register between receipt and authority deletion.
 */
export async function revokeSessionFromSender(
  tabId: number,
  sender: chrome.runtime.MessageSender,
): Promise<boolean> {
  beginTabProxyRevocation(tabId);
  try {
    return await withLock(tabLockKey(tabId), async () => {
      const session = await getSession(tabId);
      if (!session) return false;
      if (sender.tab?.id !== tabId || sender.frameId !== 0) return false;
      if (canonicalizeOrigin(sender.origin) !== session.origin) return false;
      if (session.documentId && sender.documentId !== session.documentId) return false;
      if ((await getNavGen(tabId)) !== session.navGen) return false;

      await deleteSession(tabId);
      const tabState = await getTabState(tabId);
      renderBadge(tabId, tabState?.comviDetected ?? false, false);
      return true;
    });
  } finally {
    endTabProxyRevocation(tabId);
  }
}

/** Revoke pending authority when its owning popup Port disappears. */
export async function revokePendingForLease(popupLeaseId: string): Promise<void> {
  const sessions = await getAllSessions();
  for (const [tabId, session] of sessions) {
    if (session.status !== "pending" || session.popupLeaseId !== popupLeaseId) continue;
    await withLock(tabLockKey(tabId), async () => {
      const current = await getSession(tabId);
      if (current?.status === "pending" && current.popupLeaseId === popupLeaseId) {
        await deleteSession(tabId);
        notifyProxySessionTransition(tabId);
        const tabState = await getTabState(tabId);
        renderBadge(tabId, tabState?.comviDetected ?? false, false);
      }
    });
  }
}

/**
 * Forget-key orchestration: atomically clear the persisted credential and
 * revoke every session bound to that origin, then fix affected badges.
 */
export async function forgetCredentials(
  payload: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean; error?: string; revokedTabIds: number[] }> {
  if (sender.tab) return { ok: false, error: "Not allowed", revokedTabIds: [] };

  const origin = canonicalizeOrigin((payload as { origin?: unknown } | undefined)?.origin);
  if (!origin) return { ok: false, error: "Invalid origin", revokedTabIds: [] };

  const revokedTabIds: number[] = [];
  beginGlobalProxyRevocation();
  try {
    await withLock(authorityLockKey, async () => {
      // Invalidate validations that started before this revocation acquired the lock.
      await bumpAuthorityEpoch();
      const apiKey = await clearCredentialFamily(origin);

      const sessions = await getAllSessions();
      for (const [tabId, session] of sessions) {
        if (session.origin === origin || (apiKey && session.apiKey === apiKey)) {
          await revokeSession(tabId);
          revokedTabIds.push(tabId);
        }
      }
    });
  } finally {
    endGlobalProxyRevocation();
  }
  return { ok: true, revokedTabIds };
}

/** Authoritative status for the popup. */
export async function getSessionStatus(
  payload: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<SessionStatusResponse> {
  const tabId = (payload as { tabId?: unknown } | undefined)?.tabId;
  if (sender.tab || typeof tabId !== "number") return { active: false, pending: false };
  const [session, tabState] = await Promise.all([getLiveSession(tabId), getTabState(tabId)]);
  return {
    active: session?.status === "active",
    pending: session?.status === "pending",
    ...(tabState ? { comviDetected: tabState.comviDetected, version: tabState.version } : {}),
  };
}
