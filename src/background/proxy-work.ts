/**
 * In-memory proxy work registry.
 *
 * Authority transitions and request registration are serialized by the
 * caller's per-tab lock. Keeping this module independent from sessions and
 * message routing lets every revocation abort registered work without
 * introducing a circular dependency.
 */

const MAX_CONCURRENT_PER_TAB = 8;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 300;

export interface ProxyWorkReservation {
  key: string;
  controller: AbortController;
}

export type ReserveProxyWorkResult =
  | { ok: true; reservation: ProxyWorkReservation }
  | { ok: false; error: string };

const requestLog = new Map<number, number[]>();
const controllers = new Map<string, AbortController>();
const tabRevocationDepth = new Map<number, number>();
let globalRevocationDepth = 0;

const workKey = (tabId: number, requestId: string) => `${tabId}:${requestId}`;
const tabPrefix = (tabId: number) => `${tabId}:`;

function activeCount(tabId: number): number {
  const prefix = tabPrefix(tabId);
  let count = 0;
  for (const key of controllers.keys()) {
    if (key.startsWith(prefix)) count += 1;
  }
  return count;
}

/** Register work while the caller holds tabLockKey(tabId). */
export function reserveProxyWork(
  tabId: number,
  requestId: string,
  now = Date.now(),
): ReserveProxyWorkResult {
  if (isProxyRevoking(tabId)) {
    return { ok: false, error: "No active editor session for this tab" };
  }
  const key = workKey(tabId, requestId);
  if (controllers.has(key)) return { ok: false, error: "Duplicate request id" };

  const recent = (requestLog.get(tabId) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(tabId, recent);
    return { ok: false, error: "Rate limit exceeded" };
  }
  if (activeCount(tabId) >= MAX_CONCURRENT_PER_TAB) {
    return { ok: false, error: "Too many concurrent requests" };
  }

  const controller = new AbortController();
  controllers.set(key, controller);
  recent.push(now);
  requestLog.set(tabId, recent);
  return { ok: true, reservation: { key, controller } };
}

/** Release only the exact reservation; stale completions cannot delete newer work. */
export function releaseProxyWork(reservation: ProxyWorkReservation): void {
  if (controllers.get(reservation.key) === reservation.controller) {
    controllers.delete(reservation.key);
  }
}

export function abortProxyWork(tabId: number, requestId: string): void {
  controllers.get(workKey(tabId, requestId))?.abort();
}

/** Abort and forget all work currently registered for a tab. */
export function abortTabProxyWork(tabId: number): void {
  const prefix = tabPrefix(tabId);
  for (const [key, controller] of controllers) {
    if (!key.startsWith(prefix)) continue;
    controller.abort();
    controllers.delete(key);
  }
  requestLog.delete(tabId);
}

/** Close a tab to new proxy work synchronously, before any storage await. */
export function beginTabProxyRevocation(tabId: number): void {
  tabRevocationDepth.set(tabId, (tabRevocationDepth.get(tabId) ?? 0) + 1);
  abortTabProxyWork(tabId);
}

export function endTabProxyRevocation(tabId: number): void {
  const depth = tabRevocationDepth.get(tabId) ?? 0;
  if (depth <= 1) tabRevocationDepth.delete(tabId);
  else tabRevocationDepth.set(tabId, depth - 1);
}

/** Close every tab while Forget discovers all credential/session matches. */
export function beginGlobalProxyRevocation(): void {
  globalRevocationDepth += 1;
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  requestLog.clear();
}

export function endGlobalProxyRevocation(): void {
  globalRevocationDepth = Math.max(0, globalRevocationDepth - 1);
}

export function isProxyRevoking(tabId: number): boolean {
  return globalRevocationDepth > 0 || (tabRevocationDepth.get(tabId) ?? 0) > 0;
}
