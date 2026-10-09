/**
 * The in-memory proxy work registry: activation-time waiters, per-tab
 * concurrency and rate limits, abort propagation and revocation gating.
 *
 * The registry is module-level state shared by the whole file, so every test
 * claims its own tab id, and afterEach ends any revocation still open and
 * settles every reservation and waiter a test left behind, even when one of
 * its assertions failed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abortProxyWork,
  abortTabProxyWork,
  beginGlobalProxyRevocation,
  beginTabProxyRevocation,
  endGlobalProxyRevocation,
  endTabProxyRevocation,
  getProxySessionTransitionGeneration,
  isProxyRevoking,
  notifyProxySessionTransition,
  releaseProxyWork,
  reserveProxyWork,
  waitForProxySessionTransition,
  type ProxySessionWaitOutcome,
  type ProxyWorkReservation,
} from "../proxy-work";

const MAX_CONCURRENT_PER_TAB = 8;
const MAX_REQUESTS_PER_WINDOW = 300;
const MAX_PENDING_ACTIVATION_REQUESTS_PER_TAB = 32;
const RATE_WINDOW_MS = 60_000;
const PENDING_ACTIVATION_WAIT_MS = 5_000;

let nextTabId = 100;
const touchedTabs: number[] = [];
/** A tab id no other test has touched, so module-level state cannot leak between tests. */
function freshTab(): number {
  nextTabId += 1;
  touchedTabs.push(nextTabId);
  return nextTabId;
}

function reserveOrThrow(tabId: number, requestId: string, now?: number): ProxyWorkReservation {
  const result = reserveProxyWork(tabId, requestId, now);
  if (!result.ok) throw new Error(`expected a reservation, got: ${result.error}`);
  return result.reservation;
}

/** Fill the rate-limit window for a tab without holding concurrency slots. */
function logRequests(tabId: number, count: number, now: number): void {
  for (let index = 0; index < count; index += 1) {
    releaseProxyWork(reserveOrThrow(tabId, `filler-${index}`, now));
  }
}

/** Observe settlement without awaiting: the assertion is that it has NOT happened yet. */
function track(promise: Promise<ProxySessionWaitOutcome>) {
  const settled = vi.fn();
  void promise.then(settled);
  return settled;
}

afterEach(() => {
  vi.useRealTimers();
  // Global revocation closes every tab, so a never-used id tells whether one is open.
  const probe = (nextTabId += 1);
  for (let guard = 0; guard < 10 && isProxyRevoking(probe); guard += 1) {
    endGlobalProxyRevocation();
  }
  for (const tabId of touchedTabs.splice(0)) {
    for (let guard = 0; guard < 10 && isProxyRevoking(tabId); guard += 1) {
      endTabProxyRevocation(tabId);
    }
    abortTabProxyWork(tabId);
  }
});

describe("work reservation", () => {
  it("refuses a request id that is already in flight", () => {
    const tabId = freshTab();
    reserveOrThrow(tabId, "request-1");

    expect(reserveProxyWork(tabId, "request-1")).toEqual({
      ok: false,
      error: "Duplicate request id",
    });
  });

  it("frees the request id once its reservation is released", () => {
    const tabId = freshTab();
    releaseProxyWork(reserveOrThrow(tabId, "request-1"));

    expect(reserveProxyWork(tabId, "request-1").ok).toBe(true);
  });

  it("ignores a stale release that no longer owns the request id", () => {
    const tabId = freshTab();
    const stale = reserveOrThrow(tabId, "request-1");
    releaseProxyWork(stale);
    reserveOrThrow(tabId, "request-1");

    releaseProxyWork(stale);

    expect(reserveProxyWork(tabId, "request-1")).toEqual({
      ok: false,
      error: "Duplicate request id",
    });
  });

  it("refuses work beyond the per-tab concurrency limit", () => {
    const tabId = freshTab();
    for (let index = 0; index < MAX_CONCURRENT_PER_TAB; index += 1) {
      reserveOrThrow(tabId, `request-${index}`);
    }

    expect(reserveProxyWork(tabId, "one-too-many")).toEqual({
      ok: false,
      error: "Too many concurrent requests",
    });
  });

  it("frees a concurrency slot when a reservation is released", () => {
    const tabId = freshTab();
    const reservations: ProxyWorkReservation[] = [];
    for (let index = 0; index < MAX_CONCURRENT_PER_TAB; index += 1) {
      reservations.push(reserveOrThrow(tabId, `request-${index}`));
    }

    releaseProxyWork(reservations[0]);

    expect(reserveProxyWork(tabId, "next-request").ok).toBe(true);
  });

  it("counts concurrency per tab rather than globally", () => {
    const busyTab = freshTab();
    const otherTab = freshTab();
    for (let index = 0; index < MAX_CONCURRENT_PER_TAB; index += 1) {
      reserveOrThrow(busyTab, `request-${index}`);
    }

    expect(reserveProxyWork(otherTab, "request-0").ok).toBe(true);
  });
});

describe("rate limiting", () => {
  it("refuses a request once the window is full", () => {
    const tabId = freshTab();
    logRequests(tabId, MAX_REQUESTS_PER_WINDOW, 40_000);

    expect(reserveProxyWork(tabId, "over-cap", 50_000)).toEqual({
      ok: false,
      error: "Rate limit exceeded",
    });
  });

  it("accepts a request again once the earlier ones fall outside the window", () => {
    const tabId = freshTab();
    logRequests(tabId, MAX_REQUESTS_PER_WINDOW, 40_000);

    expect(reserveProxyWork(tabId, "after-window", 40_000 + RATE_WINDOW_MS).ok).toBe(true);
  });

  it("forgets a tab's request history when its work is aborted", () => {
    const tabId = freshTab();
    logRequests(tabId, MAX_REQUESTS_PER_WINDOW, 40_000);

    abortTabProxyWork(tabId);

    expect(reserveProxyWork(tabId, "after-abort", 40_000).ok).toBe(true);
  });
});

describe("aborting work", () => {
  it("aborts only the named request", () => {
    const tabId = freshTab();
    const target = reserveOrThrow(tabId, "request-1");
    const bystander = reserveOrThrow(tabId, "request-2");

    abortProxyWork(tabId, "request-1");

    expect(target.controller.signal.aborted).toBe(true);
    expect(bystander.controller.signal.aborted).toBe(false);
  });

  it("ignores an abort for a request id it never registered", () => {
    const tabId = freshTab();

    expect(() => abortProxyWork(tabId, "never-registered")).not.toThrow();
  });

  it("aborts every request of one tab without touching another tab", () => {
    const revokedTab = freshTab();
    const otherTab = freshTab();
    const revoked = reserveOrThrow(revokedTab, "request-1");
    const survivor = reserveOrThrow(otherTab, "request-1");

    abortTabProxyWork(revokedTab);

    expect(revoked.controller.signal.aborted).toBe(true);
    expect(survivor.controller.signal.aborted).toBe(false);
    expect(reserveProxyWork(otherTab, "request-1").ok).toBe(false);
  });

  it("frees the request ids of a tab whose work was aborted", () => {
    const tabId = freshTab();
    reserveOrThrow(tabId, "request-1");

    abortTabProxyWork(tabId);

    expect(reserveProxyWork(tabId, "request-1").ok).toBe(true);
  });
});

describe("revocation gating", () => {
  it("refuses new work while a tab revocation is in progress", () => {
    const tabId = freshTab();
    beginTabProxyRevocation(tabId);

    const result = reserveProxyWork(tabId, "request-1");

    expect(result).toEqual({ ok: false, error: "No active editor session for this tab" });
  });

  it("accepts work again once the tab revocation ends", () => {
    const tabId = freshTab();
    beginTabProxyRevocation(tabId);

    endTabProxyRevocation(tabId);

    expect(reserveProxyWork(tabId, "request-1").ok).toBe(true);
  });

  it("keeps a nested tab revocation in force after only one of two ends", () => {
    const tabId = freshTab();
    beginTabProxyRevocation(tabId);
    beginTabProxyRevocation(tabId);

    endTabProxyRevocation(tabId);

    expect(isProxyRevoking(tabId)).toBe(true);
  });

  it("lifts a nested tab revocation once every begin is ended", () => {
    const tabId = freshTab();
    beginTabProxyRevocation(tabId);
    beginTabProxyRevocation(tabId);
    endTabProxyRevocation(tabId);

    endTabProxyRevocation(tabId);

    expect(isProxyRevoking(tabId)).toBe(false);
  });

  it("still revokes after an unbalanced end", () => {
    const tabId = freshTab();
    endTabProxyRevocation(tabId);

    beginTabProxyRevocation(tabId);

    expect(isProxyRevoking(tabId)).toBe(true);
  });

  it("closes every tab during a global revocation", () => {
    const tabId = freshTab();

    beginGlobalProxyRevocation();

    expect(isProxyRevoking(tabId)).toBe(true);
  });

  it("reopens every tab when the global revocation ends", () => {
    const tabId = freshTab();
    beginGlobalProxyRevocation();

    endGlobalProxyRevocation();

    expect(isProxyRevoking(tabId)).toBe(false);
  });

  it("keeps a nested global revocation in force after only one of two ends", () => {
    const tabId = freshTab();
    beginGlobalProxyRevocation();
    beginGlobalProxyRevocation();

    endGlobalProxyRevocation();

    expect(isProxyRevoking(tabId)).toBe(true);
  });

  it("lifts a nested global revocation once every begin is ended", () => {
    const tabId = freshTab();
    beginGlobalProxyRevocation();
    beginGlobalProxyRevocation();
    endGlobalProxyRevocation();

    endGlobalProxyRevocation();

    expect(isProxyRevoking(tabId)).toBe(false);
  });

  it("aborts in-flight work of every tab on a global revocation", () => {
    const tabId = freshTab();
    const reservation = reserveOrThrow(tabId, "request-1");

    beginGlobalProxyRevocation();

    expect(reservation.controller.signal.aborted).toBe(true);
  });

  it("frees the request ids of aborted work once the global revocation ends", () => {
    const tabId = freshTab();
    reserveOrThrow(tabId, "request-1");
    beginGlobalProxyRevocation();

    endGlobalProxyRevocation();

    expect(reserveProxyWork(tabId, "request-1").ok).toBe(true);
  });

  it("forgets every tab's request history on a global revocation", () => {
    const tabId = freshTab();
    logRequests(tabId, MAX_REQUESTS_PER_WINDOW, 40_000);

    beginGlobalProxyRevocation();
    endGlobalProxyRevocation();

    expect(reserveProxyWork(tabId, "after-revocation", 40_000).ok).toBe(true);
  });
});

describe("session transition generations", () => {
  it("starts a tab that has never transitioned at generation zero", () => {
    expect(getProxySessionTransitionGeneration(freshTab())).toBe(0);
  });

  it("advances the generation on every transition, not only the first", () => {
    const tabId = freshTab();
    notifyProxySessionTransition(tabId);
    const afterFirst = getProxySessionTransitionGeneration(tabId);

    notifyProxySessionTransition(tabId);

    expect(getProxySessionTransitionGeneration(tabId)).toBeGreaterThan(afterFirst);
  });
});

describe("activation-time waiters", () => {
  it("resolves at once when a transition already happened after the observed generation", async () => {
    const tabId = freshTab();
    const observed = getProxySessionTransitionGeneration(tabId);
    notifyProxySessionTransition(tabId);

    await expect(waitForProxySessionTransition(tabId, "request-1", observed)).resolves.toBe(
      "transitioned",
    );
  });

  it("reports a completed transition ahead of any request-id bookkeeping", async () => {
    const tabId = freshTab();
    const observed = getProxySessionTransitionGeneration(tabId);
    reserveOrThrow(tabId, "request-1");
    notifyProxySessionTransition(tabId);

    await expect(waitForProxySessionTransition(tabId, "request-1", observed)).resolves.toBe(
      "transitioned",
    );
  });

  it("keeps a request waiting when another tab transitions", async () => {
    const waitingTab = freshTab();
    const otherTab = freshTab();
    const waiting = waitForProxySessionTransition(
      waitingTab,
      "request-1",
      getProxySessionTransitionGeneration(waitingTab),
    );
    const settled = track(waiting);

    notifyProxySessionTransition(otherTab);
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();
  });

  it("resolves a waiting request when its own tab transitions", async () => {
    const tabId = freshTab();
    const waiting = waitForProxySessionTransition(
      tabId,
      "request-1",
      getProxySessionTransitionGeneration(tabId),
    );

    notifyProxySessionTransition(tabId);

    await expect(waiting).resolves.toBe("transitioned");
  });

  it("refuses a second wait for a request id already waiting", async () => {
    const tabId = freshTab();
    const observed = getProxySessionTransitionGeneration(tabId);
    void waitForProxySessionTransition(tabId, "request-1", observed);

    await expect(waitForProxySessionTransition(tabId, "request-1", observed)).resolves.toBe(
      "duplicate",
    );
  });

  it("refuses to wait for a request id that is already registered as in-flight work", async () => {
    const tabId = freshTab();
    reserveOrThrow(tabId, "request-1");

    await expect(
      waitForProxySessionTransition(tabId, "request-1", getProxySessionTransitionGeneration(tabId)),
    ).resolves.toBe("duplicate");
  });

  it("lets a settled request id wait again", async () => {
    const tabId = freshTab();
    const observed = getProxySessionTransitionGeneration(tabId);
    const first = waitForProxySessionTransition(tabId, "request-1", observed);
    abortProxyWork(tabId, "request-1");
    await first;

    const second = waitForProxySessionTransition(
      tabId,
      "request-1",
      getProxySessionTransitionGeneration(tabId),
    );

    const settled = track(second);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });

  it("caps how many requests one tab may hold across an activation", async () => {
    const tabId = freshTab();
    const observed = getProxySessionTransitionGeneration(tabId);
    const waiting: Promise<ProxySessionWaitOutcome>[] = [];
    for (let index = 0; index < MAX_PENDING_ACTIVATION_REQUESTS_PER_TAB; index += 1) {
      waiting.push(waitForProxySessionTransition(tabId, `request-${index}`, observed));
    }

    await expect(waitForProxySessionTransition(tabId, "one-too-many", observed)).resolves.toBe(
      "limit",
    );
  });

  it("gives up on a waiter that outlives the activation deadline", async () => {
    vi.useFakeTimers();
    const tabId = freshTab();
    const waiting = waitForProxySessionTransition(
      tabId,
      "request-1",
      getProxySessionTransitionGeneration(tabId),
    );

    vi.advanceTimersByTime(PENDING_ACTIVATION_WAIT_MS);

    await expect(waiting).resolves.toBe("timeout");
  });

  it("cancels the deadline timer when a waiter settles early", async () => {
    vi.useFakeTimers();
    const tabId = freshTab();
    const waiting = waitForProxySessionTransition(
      tabId,
      "request-1",
      getProxySessionTransitionGeneration(tabId),
    );

    notifyProxySessionTransition(tabId);
    await waiting;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles every waiter of a tab when its work is aborted", async () => {
    const tabId = freshTab();
    const waiting = waitForProxySessionTransition(
      tabId,
      "request-1",
      getProxySessionTransitionGeneration(tabId),
    );

    abortTabProxyWork(tabId);

    await expect(waiting).resolves.toBe("aborted");
  });

  it("settles waiters of every tab on a global revocation", async () => {
    const tabId = freshTab();
    const waiting = waitForProxySessionTransition(
      tabId,
      "request-1",
      getProxySessionTransitionGeneration(tabId),
    );

    beginGlobalProxyRevocation();

    await expect(waiting).resolves.toBe("aborted");
  });
});

describe("per-tab activation budget", () => {
  it("counts activation waiters per tab rather than globally", async () => {
    const busyTab = freshTab();
    const otherTab = freshTab();
    const observed = getProxySessionTransitionGeneration(busyTab);
    const waiting: Promise<ProxySessionWaitOutcome>[] = [];
    for (let index = 0; index < MAX_PENDING_ACTIVATION_REQUESTS_PER_TAB; index += 1) {
      waiting.push(waitForProxySessionTransition(busyTab, `queued-${index}`, observed));
    }

    const spare = waitForProxySessionTransition(
      otherTab,
      "request-1",
      getProxySessionTransitionGeneration(otherTab),
    );

    const settled = track(spare);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });
});
