/**
 * Background service worker — message routing and tab lifecycle wiring.
 *
 * All security-relevant logic lives in the sibling modules:
 * - sessions.ts   — fail-closed two-phase session state machine
 * - proxy-handler.ts — authenticated API proxy with the route contract
 * - state.ts      — per-tab chrome.storage.session records (MV3-safe)
 * - badge.ts      — badge "ON" derived only from trusted session state
 *
 * This file only dispatches events into those modules.
 */

import type { Message, StatusResponsePayload, EditorActivatedMessage } from "../shared/messages";
import { ensureStorageSchema } from "../shared/storage";
import {
  startSession,
  confirmActivation,
  rollbackPending,
  revokeSession,
  forgetCredentials,
  getSessionStatus,
  revokePendingForLease,
  revokeSessionFromSender,
  sweepExpiredPendingSessions,
} from "./sessions";
import { handleProxyRequest, abortProxyRequest } from "./proxy-handler";
import { beginTabProxyRevocation, endTabProxyRevocation } from "./proxy-work";
import {
  putTabState,
  deleteTabState,
  deleteSession,
  deleteNavGen,
  bumpNavGen,
  withLock,
  tabLockKey,
  getSession,
  type TabState,
} from "./state";
import { renderBadge, resetBadge } from "./badge";

let initialization: Promise<void> = Promise.resolve();

async function reconcileAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id === "number") resetBadge(tab.id);
    }),
  );
}

export function initializeServiceWorkerState(clearSessions = false): Promise<void> {
  initialization = initialization
    .catch(() => {})
    .then(async () => {
      const migrated = await ensureStorageSchema();
      if (clearSessions || migrated) {
        await chrome.storage.session.clear();
        await reconcileAllBadges();
        return;
      }
      await sweepExpiredPendingSessions();
    });
  return initialization;
}

// Module evaluation happens on every MV3 worker start, so expired pending
// records are swept even when no page attempts to use them.
void initializeServiceWorkerState();

function whenServiceWorkerReady<T>(operation: () => Promise<T>): Promise<T> {
  return initialization.then(operation);
}

// --- message routing ---

const POPUP_PORT_NAME = "comvi-popup-lifecycle";
const popupLeases = new Map<string, chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT_NAME || port.sender?.tab) return;

  let leaseId: string | undefined;
  port.onMessage.addListener((message: unknown) => {
    const candidate = (message as { type?: unknown; leaseId?: unknown } | undefined)?.leaseId;
    if (
      (message as { type?: unknown } | undefined)?.type !== "REGISTER_POPUP" ||
      typeof candidate !== "string" ||
      candidate.length < 16 ||
      candidate.length > 128
    ) {
      return;
    }
    leaseId = candidate;
    popupLeases.set(candidate, port);
    port.postMessage({ type: "POPUP_REGISTERED", leaseId: candidate });
  });
  port.onDisconnect.addListener(() => {
    if (!leaseId || popupLeases.get(leaseId) !== port) return;
    const disconnectedLeaseId = leaseId;
    popupLeases.delete(disconnectedLeaseId);
    void whenServiceWorkerReady(() => revokePendingForLease(disconnectedLeaseId));
  });
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  switch (message.type) {
    // Extension-page (popup) requests. Sender restrictions are enforced
    // inside each handler (sender.tab must be absent).
    case "START_SESSION":
      void whenServiceWorkerReady(() =>
        startSession(message.payload, sender, (leaseId) => popupLeases.has(leaseId)),
      ).then(sendResponse);
      return true;

    case "END_SESSION": {
      const tabId = (message.payload as { tabId?: unknown } | undefined)?.tabId;
      if (!sender.tab && typeof tabId === "number") {
        void whenServiceWorkerReady(() => revokeSession(tabId)).then(() =>
          sendResponse({ ok: true }),
        );
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

    case "FORGET_CREDENTIALS":
      void whenServiceWorkerReady(() => forgetCredentials(message.payload, sender)).then(
        sendResponse,
      );
      return true;

    case "GET_SESSION_STATUS":
      void whenServiceWorkerReady(() => getSessionStatus(message.payload, sender)).then(
        sendResponse,
      );
      return true;

    // Content-script (bridge) requests.
    case "API_PROXY_REQUEST":
      void whenServiceWorkerReady(() => handleProxyRequest(message.payload, sender)).then(
        sendResponse,
      );
      return true;

    case "API_PROXY_ABORT":
      abortProxyRequest(message.payload, sender);
      return false;
  }

  // Status messages below only make sense from content scripts (with a tab).
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return false;

  switch (message.type) {
    case "COMVI_DETECTED": {
      // Detection metadata drives the icon variant only — never the badge,
      // which is an authority indicator derived from session state.
      const payload = (message.payload ?? {}) as StatusResponsePayload;
      void whenServiceWorkerReady(async () => {
        await withLock(tabLockKey(tabId), async () => {
          const state: TabState = {
            comviDetected: true,
            version: typeof payload.version === "string" ? payload.version : undefined,
          };
          await putTabState(tabId, state);
          const session = await getSession(tabId);
          renderBadge(tabId, true, session?.status === "active");
        });
      });
      break;
    }

    case "COMVI_NOT_FOUND": {
      void whenServiceWorkerReady(async () => {
        await withLock(tabLockKey(tabId), async () => {
          await putTabState(tabId, { comviDetected: false });
          const session = await getSession(tabId);
          renderBadge(tabId, false, session?.status === "active");
        });
      });
      break;
    }

    case "EDITOR_ACTIVATED": {
      const detail = (message.payload ?? {}) as EditorActivatedMessage;
      if (detail.success === true) {
        void whenServiceWorkerReady(() =>
          confirmActivation(tabId, sender, detail.nonce, detail.collectContext, (leaseId) =>
            popupLeases.has(leaseId),
          ),
        );
      } else {
        // Failed activation rolls the pending session back (nonce required,
        // so a page-forged failure cannot cancel a session it never saw).
        void whenServiceWorkerReady(() => rollbackPending(tabId, detail.nonce));
      }
      break;
    }

    case "EDITOR_DEACTIVATED": {
      // Lifecycle validation and revocation are gated before the first
      // storage read; stale/subframe events release the gate without deleting.
      void whenServiceWorkerReady(() => revokeSessionFromSender(tabId, sender));
      break;
    }
  }

  return false;
});

// --- extension lifecycle ---

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    // Active authority never crosses an extension update. Credentials only
    // survive when their explicit schema version is still compatible.
    void initializeServiceWorkerState(true);
  }
});

// --- tab lifecycle cleanup ---

chrome.tabs.onRemoved.addListener((tabId) => {
  beginTabProxyRevocation(tabId);
  void whenServiceWorkerReady(() =>
    withLock(tabLockKey(tabId), async () => {
      try {
        await deleteSession(tabId);
        await deleteTabState(tabId);
        await deleteNavGen(tabId);
      } finally {
        endTabProxyRevocation(tabId);
      }
    }),
  );
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    beginTabProxyRevocation(tabId);
    void whenServiceWorkerReady(() =>
      withLock(tabLockKey(tabId), async () => {
        try {
          await bumpNavGen(tabId);
          await deleteSession(tabId);
          await deleteTabState(tabId);
          resetBadge(tabId);
        } finally {
          endTabProxyRevocation(tabId);
        }
      }),
    );
  }
});
