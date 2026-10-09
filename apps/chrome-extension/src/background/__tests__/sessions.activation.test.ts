/**
 * Session state machine: pending expiry, promotion on activation, and rollback of a failed activation.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PENDING_TTL_MS,
  confirmActivation,
  getLiveSession,
  rollbackPending,
  startSession,
  sweepExpiredPendingSessions,
} from "../sessions";
import { bumpNavGen, getSession, putSession, putTabState } from "../state";
import { getProxySessionTransitionGeneration } from "../proxy-work";
import {
  TAB,
  OTHER_TAB,
  OTHER_ORIGIN,
  popupSender,
  pageSender,
  harness,
  payload,
  openPendingSession,
  openActiveSession,
  storedSession,
  settle,
  holdTabLock,
  lastIconPath,
} from "./sessions.suite";

describe("pending expiry", () => {
  it("hides and revokes a pending session past its deadline", async () => {
    await putSession(TAB, storedSession({ status: "pending", expiresAt: Date.now() - 1 }));

    await expect(getLiveSession(TAB)).resolves.toBeUndefined();
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("keeps an active session whose record still carries a deadline", async () => {
    await putSession(TAB, storedSession({ status: "active", expiresAt: Date.now() - 1 }));

    await expect(getLiveSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("keeps a pending session that carries no deadline", async () => {
    await putSession(TAB, storedSession({ status: "pending", expiresAt: 0 }));

    await expect(getLiveSession(TAB)).resolves.toMatchObject({ status: "pending" });
  });

  it("sweeps only the records whose deadline has passed", async () => {
    await putSession(TAB, storedSession({ status: "pending", expiresAt: 1_000 }));
    await putSession(OTHER_TAB, storedSession({ status: "active" }));

    await expect(sweepExpiredPendingSessions(1_001)).resolves.toBe(1);
    await expect(getSession(TAB)).resolves.toBeUndefined();
    await expect(getSession(OTHER_TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("keeps a record whose deadline is exactly now", async () => {
    await putSession(TAB, storedSession({ status: "pending", expiresAt: 1_000 }));

    await expect(sweepExpiredPendingSessions(1_000)).resolves.toBe(0);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "pending" });
  });

  it("removes a pending session when its deadline elapses and clears the badge", async () => {
    vi.useFakeTimers();
    await openPendingSession();
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await vi.advanceTimersByTimeAsync(PENDING_TTL_MS + 1);

    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
    expect(lastIconPath()).toContain("icon-inactive-16");
  });

  // The expired record is read before the tab lock. A replacement created in
  // that window belongs to a newer activation and must survive the cleanup.
  it.each([
    ["a status read", () => getLiveSession(TAB)],
    ["the startup sweep", () => sweepExpiredPendingSessions()],
  ])("keeps a replacement created while %s waits for the tab lock", async (_label, cleanup) => {
    await putSession(TAB, storedSession({ status: "pending", expiresAt: Date.now() - 1 }));
    const lock = holdTabLock();

    const cleaning = cleanup();
    await settle();
    const replacement = storedSession({
      status: "pending",
      nonce: "nonce-replacement",
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
    await putSession(TAB, replacement);
    lock.release();
    await lock.done;
    await cleaning;

    await expect(getSession(TAB)).resolves.toEqual(replacement);
  });

  it("only removes the session its own deadline was scheduled for", async () => {
    vi.useFakeTimers();
    await openPendingSession();
    await rollbackPending(TAB, (await getSession(TAB))?.nonce);
    const replacement = storedSession({
      status: "pending",
      nonce: "nonce-2",
      expiresAt: Date.now() - 1,
    });
    await putSession(TAB, replacement);

    await vi.advanceTimersByTimeAsync(PENDING_TTL_MS + 1);

    await expect(getSession(TAB)).resolves.toEqual(replacement);
  });

  it("schedules the deadline with a browser-style numeric timer handle", async () => {
    const handles: ReturnType<typeof setTimeout>[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    vi.stubGlobal("setTimeout", (callback: () => void, delay: number) => {
      handles.push(realSetTimeout(callback, delay));
      return handles.length - 1;
    });
    vi.stubGlobal("clearTimeout", (handle: number) => realClearTimeout(handles[handle]));

    await expect(startSession(payload(), popupSender)).resolves.toMatchObject({ ok: true });

    for (const handle of handles) realClearTimeout(handle);
  });

  it("keeps the detected icon when an expiring session's page still reports Comvi", async () => {
    vi.useFakeTimers();
    await openPendingSession();
    await putTabState(TAB, { comviDetected: true });

    await vi.advanceTimersByTimeAsync(PENDING_TTL_MS + 1);

    expect(lastIconPath()).toContain("icon-detected-16");
  });
});

describe("activation", () => {
  it("promotes a pending session on a valid acknowledgement", async () => {
    const nonce = await openPendingSession();
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await expect(confirmActivation(TAB, pageSender(), nonce, true, () => true)).resolves.toBe(true);

    await expect(getSession(TAB)).resolves.toMatchObject({
      status: "active",
      collectContext: true,
      documentId: "doc-1",
      expiresAt: 0,
    });
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
  });

  it("keeps context collection closed unless activation reports it enabled", async () => {
    const nonce = await openPendingSession();

    await confirmActivation(TAB, pageSender(), nonce, "true", () => true);

    await expect(getSession(TAB)).resolves.toMatchObject({ collectContext: false });
  });

  it("shows the detected icon and the ON badge after activation", async () => {
    const nonce = await openPendingSession();

    await confirmActivation(TAB, pageSender(), nonce, true, () => true);

    expect(lastIconPath()).toContain("icon-detected-16");
    expect(harness.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "ON", tabId: TAB });
  });

  // Proxy enforcement is bound to the acknowledging document. Without a
  // document identity there is nothing to bind, so promotion fails closed.
  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("refuses an acknowledgement whose document identity is %s", async (_label, documentId) => {
    const nonce = await openPendingSession();

    await expect(
      confirmActivation(TAB, pageSender({ documentId }), nonce, true, () => true),
    ).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "pending" });
  });

  it("refuses an acknowledgement for a tab with no session", async () => {
    await expect(confirmActivation(TAB, pageSender(), "any-nonce", true, () => true)).resolves.toBe(
      false,
    );
  });

  it("refuses to re-promote a session that is already active", async () => {
    const nonce = await openActiveSession();

    await expect(confirmActivation(TAB, pageSender(), nonce, true, () => true)).resolves.toBe(
      false,
    );
  });

  it("refuses and removes a pending session whose deadline has passed", async () => {
    await putSession(TAB, storedSession({ status: "pending", expiresAt: Date.now() - 1 }));
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await expect(confirmActivation(TAB, pageSender(), "nonce-1", true, () => true)).resolves.toBe(
      false,
    );
    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
  });

  it("refuses an acknowledgement carrying the wrong nonce", async () => {
    await openPendingSession();

    await expect(
      confirmActivation(TAB, pageSender(), "forged-nonce", true, () => true),
    ).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "pending" });
  });

  it("refuses an acknowledgement with no nonce at all", async () => {
    await openPendingSession();

    await expect(confirmActivation(TAB, pageSender(), undefined, true, () => true)).resolves.toBe(
      false,
    );
  });

  it("refuses and removes a pending session whose popup has closed", async () => {
    const nonce = await openPendingSession();
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await expect(confirmActivation(TAB, pageSender(), nonce, true, () => false)).resolves.toBe(
      false,
    );
    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
  });

  it("refuses an acknowledgement relayed from another tab", async () => {
    const nonce = await openPendingSession();

    await expect(
      confirmActivation(
        TAB,
        pageSender({ tab: { id: OTHER_TAB } as chrome.tabs.Tab }),
        nonce,
        true,
        () => true,
      ),
    ).resolves.toBe(false);
  });

  it("refuses an acknowledgement that did not come from a tab", async () => {
    const nonce = await openPendingSession();

    await expect(confirmActivation(TAB, popupSender, nonce, true, () => true)).resolves.toBe(false);
  });

  it("refuses an acknowledgement from a subframe", async () => {
    const nonce = await openPendingSession();

    await expect(
      confirmActivation(TAB, pageSender({ frameId: 3 }), nonce, true, () => true),
    ).resolves.toBe(false);
  });

  it("refuses an acknowledgement from another origin", async () => {
    const nonce = await openPendingSession();

    await expect(
      confirmActivation(TAB, pageSender({ origin: OTHER_ORIGIN }), nonce, true, () => true),
    ).resolves.toBe(false);
  });

  it("refuses an acknowledgement after the tab navigated", async () => {
    const nonce = await openPendingSession();
    await bumpNavGen(TAB);

    await expect(confirmActivation(TAB, pageSender(), nonce, true, () => true)).resolves.toBe(
      false,
    );
  });

  it("refuses an acknowledgement once the tab shows another origin", async () => {
    const nonce = await openPendingSession();
    harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);

    await expect(confirmActivation(TAB, pageSender(), nonce, true, () => true)).resolves.toBe(
      false,
    );
  });
});

describe("rollback of a failed activation", () => {
  it("removes the pending session named by the nonce", async () => {
    const nonce = await openPendingSession();
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await rollbackPending(TAB, nonce);

    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
  });

  it("ignores a rollback carrying the wrong nonce", async () => {
    await openPendingSession();

    await rollbackPending(TAB, "forged-nonce");

    await expect(getSession(TAB)).resolves.toMatchObject({ status: "pending" });
  });

  it("ignores a rollback for an active session", async () => {
    const nonce = await openActiveSession();

    await rollbackPending(TAB, nonce);

    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("ignores a rollback for a tab with no session", async () => {
    await expect(rollbackPending(TAB, "any-nonce")).resolves.toBeUndefined();
  });
});
