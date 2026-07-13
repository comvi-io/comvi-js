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

import type {
  Message,
  StatusResponsePayload,
  EditorActivatedMessage,
  SessionStateChangedPayload,
} from "../shared/messages";
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
  getTabState,
  getAllSessions,
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
        const affectedTabs = [...(await getAllSessions()).keys()];
        await chrome.storage.session.clear();
        await reconcileAllBadges();
        for (const tabId of affectedTabs) {
          deactivatePageRuntime(tabId);
          broadcastSessionState({ tabId, active: false, pending: false });
        }
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

function broadcastSessionState(payload: SessionStateChangedPayload): void {
  chrome.runtime.sendMessage({ type: "SESSION_STATE_CHANGED", payload }, () => {
    // No popup being open is the normal case. Reading lastError prevents the
    // unchecked-response warning without turning it into a lifecycle failure.
    void chrome.runtime.lastError;
  });
}

function deactivatePageRuntime(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: "DEACTIVATE_EDITOR" } satisfies Message, () => {
    void chrome.runtime.lastError;
  });
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
    case "DOCUMENT_READY": {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number" || sender.frameId !== 0) {
        sendResponse({ ok: false });
        return false;
      }

      // The manifest bridge emits this once at document_start. Unlike
      // tabs.onUpdated, this is not emitted for History API / SPA routes.
      beginTabProxyRevocation(tabId);
      void (async () => {
        try {
          return await whenServiceWorkerReady(() =>
            withLock(tabLockKey(tabId), async () => {
              const previous = await getTabState(tabId);
              if (sender.documentId && previous?.documentId === sender.documentId) return false;
              await bumpNavGen(tabId);
              await deleteSession(tabId);
              await putTabState(tabId, {
                comviDetected: false,
                documentId: sender.documentId,
              });
              resetBadge(tabId);
              return true;
            }),
          );
        } finally {
          endTabProxyRevocation(tabId);
        }
      })().then(
        (changed) => {
          if (changed) {
            broadcastSessionState({
              tabId,
              active: false,
              pending: false,
              comviDetected: false,
            });
          }
          sendResponse({ ok: true });
        },
        () => sendResponse({ ok: false }),
      );
      return true;
    }

    // Extension-page (popup) requests. Sender restrictions are enforced
    // inside each handler (sender.tab must be absent).
    case "START_SESSION":
      void whenServiceWorkerReady(() =>
        startSession(message.payload, sender, (leaseId) => popupLeases.has(leaseId)),
      ).then(sendResponse);
      return true;

    case "ROLLBACK_ACTIVATION": {
      const { tabId, nonce } = (message.payload ?? {}) as {
        tabId?: unknown;
        nonce?: unknown;
      };
      if (!sender.tab && typeof tabId === "number") {
        void whenServiceWorkerReady(async () => {
          await rollbackPending(tabId, nonce);
          const status = await getSessionStatus({ tabId }, sender);
          broadcastSessionState({ tabId, ...status });
          if (!status.active) deactivatePageRuntime(tabId);
          return { ok: true };
        }).then(sendResponse);
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

    case "END_SESSION": {
      const tabId = (message.payload as { tabId?: unknown } | undefined)?.tabId;
      if (!sender.tab && typeof tabId === "number") {
        void whenServiceWorkerReady(async () => {
          await revokeSession(tabId);
          broadcastSessionState({ tabId, active: false, pending: false });
          deactivatePageRuntime(tabId);
          return { ok: true };
        }).then(sendResponse);
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

    case "FORGET_CREDENTIALS":
      void whenServiceWorkerReady(async () => {
        const result = await forgetCredentials(message.payload, sender);
        if (result.ok) {
          for (const tabId of result.revokedTabIds) {
            broadcastSessionState({ tabId, active: false, pending: false });
            deactivatePageRuntime(tabId);
          }
        }
        return { ok: result.ok, error: result.error };
      }).then(sendResponse);
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
            documentId: (await getTabState(tabId))?.documentId,
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
          const current = await getTabState(tabId);
          await putTabState(tabId, {
            comviDetected: false,
            documentId: current?.documentId,
          });
          const session = await getSession(tabId);
          renderBadge(tabId, false, session?.status === "active");
        });
      });
      break;
    }

    case "EDITOR_ACTIVATED": {
      const detail = (message.payload ?? {}) as EditorActivatedMessage;
      if (detail.success === true) {
        void whenServiceWorkerReady(async () => {
          const active = await confirmActivation(
            tabId,
            sender,
            detail.nonce,
            detail.collectContext,
            (leaseId) => popupLeases.has(leaseId),
          );
          const status = await getSessionStatus({ tabId }, {} as chrome.runtime.MessageSender);
          broadcastSessionState({
            tabId,
            ...status,
            ...(!active
              ? { error: "The editor activation could not be confirmed. Try again." }
              : {}),
          });
          if (!active) deactivatePageRuntime(tabId);
        });
      } else {
        // Failed activation rolls the pending session back (nonce required,
        // so a page-forged failure cannot cancel a session it never saw).
        void whenServiceWorkerReady(async () => {
          await rollbackPending(tabId, detail.nonce);
          const status = await getSessionStatus({ tabId }, {} as chrome.runtime.MessageSender);
          broadcastSessionState({
            tabId,
            ...status,
            error: detail.error ?? "The editor could not be enabled.",
          });
          deactivatePageRuntime(tabId);
        });
      }
      break;
    }

    case "EDITOR_DEACTIVATED": {
      // Lifecycle validation and revocation are gated before the first
      // storage read; stale/subframe events release the gate without deleting.
      void whenServiceWorkerReady(async () => {
        const revoked = await revokeSessionFromSender(tabId, sender);
        if (revoked) broadcastSessionState({ tabId, active: false, pending: false });
      });
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
