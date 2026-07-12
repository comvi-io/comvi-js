/**
 * Authenticated API proxy.
 *
 * Executes editor API requests on behalf of a tab with an *active* session.
 * Authorization is checked in this order: sender identity (tab, top frame,
 * canonical origin, bound document, navigation generation) -> session state
 * -> route contract (shared/proxy.ts) -> resource limits. Only then is the
 * Authorization header attached and the request sent to the fixed API origin.
 *
 * Limits (concurrency, rate window, in-flight abort handles) are held in
 * memory: they are denial-of-service mitigations, not authority — authority
 * lives in chrome.storage.session and survives worker restarts, the counters
 * simply start fresh.
 */

import { validateProxyRequest } from "../shared/proxy";
import { canonicalizeOrigin } from "../shared/origins";
import { API_BASE_URL } from "../shared/config";
import type { ApiProxyResponsePayload } from "../shared/messages";
import {
  abortProxyWork,
  abortTabProxyWork,
  isProxyRevoking,
  releaseProxyWork,
  reserveProxyWork,
} from "./proxy-work";
import { renderBadge } from "./badge";
import { deleteSession, getNavGen, getSession, getTabState, tabLockKey, withLock } from "./state";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10_000_000;

export function clearTabLimits(tabId: number): void {
  abortTabProxyWork(tabId);
}

/** Page-requested cancellation of an in-flight proxied request. */
export function abortProxyRequest(payload: unknown, sender: chrome.runtime.MessageSender): void {
  const tabId = sender.tab?.id;
  const id = (payload as { id?: unknown } | undefined)?.id;
  if (typeof tabId !== "number" || typeof id !== "string") return;
  abortProxyWork(tabId, id);
}

// --- request handling ---

function failure(id: string, error: string): ApiProxyResponsePayload {
  return { id, ok: false, status: 0, statusText: "", body: "", networkError: error };
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_RESPONSE_BYTES) {
      throw new RangeError("Response too large");
    }
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel("Response too large");
        throw new RangeError("Response too large");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

export async function handleProxyRequest(
  payload: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<ApiProxyResponsePayload> {
  const rawId =
    payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string"
      ? (payload as { id: string }).id
      : "";

  // --- sender identity ---
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    return failure(rawId, "Proxy requests must come from a tab");
  }
  if (sender.frameId !== 0) {
    return failure(rawId, "Proxy requests are only allowed from the top frame");
  }

  // Authority validation and work registration are one per-tab transition.
  // A revocation either runs first (no session) or runs second and aborts the
  // registered controller before it can escape into an authenticated fetch.
  const setup = await withLock(tabLockKey(tabId), async () => {
    if (isProxyRevoking(tabId)) {
      return {
        ok: false as const,
        response: failure(rawId, "No active editor session for this tab"),
      };
    }
    const session = await getSession(tabId);
    if (!session || session.status !== "active") {
      return {
        ok: false as const,
        response: failure(rawId, "No active editor session for this tab"),
      };
    }
    if (canonicalizeOrigin(sender.origin) !== session.origin) {
      return { ok: false as const, response: failure(rawId, "Origin mismatch") };
    }
    if (session.documentId && sender.documentId !== session.documentId) {
      return { ok: false as const, response: failure(rawId, "Stale document") };
    }
    if ((await getNavGen(tabId)) !== session.navGen) {
      abortTabProxyWork(tabId);
      await deleteSession(tabId);
      const tabState = await getTabState(tabId);
      renderBadge(tabId, tabState?.comviDetected ?? false, false);
      return {
        ok: false as const,
        response: failure(rawId, "Session invalidated by navigation"),
      };
    }

    const validated = validateProxyRequest(payload, API_BASE_URL, {
      origin: session.origin,
      projectId: session.projectId,
      collectContext: session.collectContext,
    });
    if (!validated.ok) {
      return { ok: false as const, response: failure(rawId, validated.error) };
    }

    const reserved = reserveProxyWork(tabId, validated.id);
    if (!reserved.ok) {
      return { ok: false as const, response: failure(validated.id, reserved.error) };
    }
    return { ok: true as const, session, validated, reservation: reserved.reservation };
  });
  if (!setup.ok) return setup.response;

  const { session, validated, reservation } = setup;
  const { controller } = reservation;
  // A queued revocation may run immediately after registration but before
  // this continuation. Never call fetch with authority that is already gone.
  if (controller.signal.aborted || isProxyRevoking(tabId)) {
    releaseProxyWork(reservation);
    return failure(validated.id, "Request aborted");
  }
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${session.apiKey}`,
    };
    if (validated.body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(validated.url, {
      method: validated.method,
      headers,
      body: validated.body,
      keepalive: validated.keepalive,
      signal: controller.signal,
    });

    const body = await readBoundedResponseBody(response);

    return {
      id: validated.id,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return failure(validated.id, "Request aborted");
    }
    if (error instanceof RangeError && error.message === "Response too large") {
      controller.abort();
      return failure(validated.id, error.message);
    }
    return failure(validated.id, error instanceof Error ? error.message : "Request failed");
  } finally {
    clearTimeout(timeout);
    releaseProxyWork(reservation);
  }
}
