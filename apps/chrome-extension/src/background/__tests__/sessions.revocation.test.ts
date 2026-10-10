/**
 * Session state machine: every revocation path, Forget key, and the status the popup reads.
 */
import { describe, expect, it } from "vitest";
import {
  forgetCredentials,
  getSessionStatus,
  revokePendingForLease,
  revokeSession,
  revokeSessionFromSender,
} from "../sessions";
import { bumpNavGen, deleteSession, getSession, putSession, putTabState } from "../state";
import { getProxySessionTransitionGeneration, isProxyRevoking } from "../proxy-work";
import { setCredentials, getAllCredentials } from "../../shared/storage";
import {
  TAB,
  OTHER_TAB,
  ORIGIN,
  OTHER_ORIGIN,
  API_KEY,
  LEASE,
  popupSender,
  pageSender,
  harness,
  openPendingSession,
  openActiveSession,
  storedSession,
  settle,
  holdTabLock,
  lastIconPath,
} from "./sessions.suite";

describe("revocation", () => {
  it("deletes the session and clears the badge", async () => {
    await openActiveSession();

    await revokeSession(TAB);

    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(harness.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "", tabId: TAB });
    expect(lastIconPath()).toContain("icon-inactive-16");
  });

  it("keeps the detected icon for a revoked tab whose page still reports Comvi", async () => {
    await openActiveSession();
    await putTabState(TAB, { comviDetected: true });

    await revokeSession(TAB);

    expect(lastIconPath()).toContain("icon-detected-16");
  });

  it("reopens the tab to proxy work once the revocation finishes", async () => {
    await openActiveSession();

    await revokeSession(TAB);

    expect(isProxyRevoking(TAB)).toBe(false);
  });
});

describe("revocation from an editor lifecycle event", () => {
  it("revokes the session and reports it", async () => {
    await openActiveSession();

    await expect(revokeSessionFromSender(TAB, pageSender())).resolves.toBe(true);
    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(lastIconPath()).toContain("icon-inactive-16");
  });

  it("keeps the detected icon when the page still reports Comvi", async () => {
    await openActiveSession();
    await putTabState(TAB, { comviDetected: true });

    await revokeSessionFromSender(TAB, pageSender());

    expect(lastIconPath()).toContain("icon-detected-16");
  });

  it("reports nothing to revoke for a tab with no session", async () => {
    await expect(revokeSessionFromSender(TAB, pageSender())).resolves.toBe(false);
  });

  it("refuses a deactivation relayed by another tab", async () => {
    await openActiveSession();

    await expect(
      revokeSessionFromSender(TAB, pageSender({ tab: { id: OTHER_TAB } as chrome.tabs.Tab })),
    ).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("refuses a deactivation that did not come from a tab", async () => {
    await openActiveSession();

    await expect(revokeSessionFromSender(TAB, popupSender)).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("refuses a deactivation from a subframe", async () => {
    await openActiveSession();

    // A subframe is its own document; Chrome never gives it the top document's id.
    await expect(
      revokeSessionFromSender(TAB, pageSender({ frameId: 2, documentId: "subframe-doc" })),
    ).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  // Observed in Chromium: a top-level document entering the back/forward
  // cache sends its pagehide message with a non-zero frameId and
  // documentLifecycle "cached". Its document id still identifies it.
  it("revokes when the bound document leaves for the back/forward cache", async () => {
    await openActiveSession();

    await expect(
      revokeSessionFromSender(
        TAB,
        pageSender({
          frameId: 2,
          documentLifecycle: "cached",
        } as Partial<chrome.runtime.MessageSender>),
      ),
    ).resolves.toBe(true);
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("refuses a deactivation from another origin", async () => {
    await openActiveSession();

    await expect(revokeSessionFromSender(TAB, pageSender({ origin: OTHER_ORIGIN }))).resolves.toBe(
      false,
    );
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("refuses a deactivation from a document the session is not bound to", async () => {
    await openActiveSession();

    await expect(revokeSessionFromSender(TAB, pageSender({ documentId: "doc-2" }))).resolves.toBe(
      false,
    );
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("refuses a deactivation that arrives after a navigation", async () => {
    await openActiveSession();
    await bumpNavGen(TAB);

    await expect(revokeSessionFromSender(TAB, pageSender())).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });
});

describe("revocation when a popup lease disappears", () => {
  it("removes the pending session the closed popup owned", async () => {
    await openPendingSession();
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await revokePendingForLease(LEASE);

    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
    expect(lastIconPath()).toContain("icon-inactive-16");
  });

  it("keeps the detected icon for a page that still reports Comvi", async () => {
    await openPendingSession();
    await putTabState(TAB, { comviDetected: true });

    await revokePendingForLease(LEASE);

    expect(lastIconPath()).toContain("icon-detected-16");
  });

  it("leaves a session that another popup lease owns", async () => {
    await putSession(TAB, storedSession({ status: "pending", popupLeaseId: "other-lease-000001" }));

    await revokePendingForLease(LEASE);

    await expect(getSession(TAB)).resolves.toMatchObject({ status: "pending" });
  });

  it("keeps a session that was promoted after the enumeration snapshot", async () => {
    const nonce = await openPendingSession();
    const holdingLock = holdTabLock();
    const revoking = revokePendingForLease(LEASE);
    await settle();
    await putSession(TAB, storedSession({ status: "active", nonce }));

    holdingLock.release();
    await Promise.all([revoking, holdingLock.done]);

    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });

  it("keeps a session handed to another popup after the enumeration snapshot", async () => {
    const nonce = await openPendingSession();
    const holdingLock = holdTabLock();
    const revoking = revokePendingForLease(LEASE);
    await settle();
    await putSession(
      TAB,
      storedSession({ status: "pending", nonce, popupLeaseId: "other-lease-000001" }),
    );

    holdingLock.release();
    await Promise.all([revoking, holdingLock.done]);

    await expect(getSession(TAB)).resolves.toMatchObject({
      popupLeaseId: "other-lease-000001",
    });
  });

  it("tolerates a session that disappeared after the enumeration snapshot", async () => {
    await openPendingSession();
    const holdingLock = holdTabLock();
    const revoking = revokePendingForLease(LEASE);
    await settle();
    await deleteSession(TAB);

    holdingLock.release();

    await expect(revoking).resolves.toBeUndefined();
    await holdingLock.done;
  });

  it("leaves an active session that the closed popup opened", async () => {
    await openActiveSession();

    await revokePendingForLease(LEASE);

    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
  });
});

describe("forgetting a credential", () => {
  it("clears the credential and revokes the sessions bound to the origin", async () => {
    await openActiveSession();

    await expect(forgetCredentials({ origin: ORIGIN }, popupSender)).resolves.toEqual({
      ok: true,
      revokedTabIds: [TAB],
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
    await expect(getAllCredentials()).resolves.toEqual({});
  });

  it("revokes a session on another origin that reuses the same key", async () => {
    await openActiveSession();
    await setCredentials(OTHER_ORIGIN, { apiKey: API_KEY, validated: true });
    await putSession(OTHER_TAB, storedSession({ origin: OTHER_ORIGIN }));

    const result = await forgetCredentials({ origin: ORIGIN }, popupSender);

    expect(result.revokedTabIds).toEqual([TAB, OTHER_TAB]);
    await expect(getSession(OTHER_TAB)).resolves.toBeUndefined();
  });

  it("revokes a stale session on the forgotten origin that holds an older key", async () => {
    await openActiveSession();
    await putSession(OTHER_TAB, storedSession({ origin: ORIGIN, apiKey: "cmv_previous_key" }));

    const result = await forgetCredentials({ origin: ORIGIN }, popupSender);

    expect(result.revokedTabIds).toEqual([TAB, OTHER_TAB]);
    await expect(getSession(OTHER_TAB)).resolves.toBeUndefined();
  });

  it("leaves a session on another origin that uses a different key", async () => {
    await openActiveSession();
    await putSession(OTHER_TAB, storedSession({ origin: OTHER_ORIGIN, apiKey: "cmv_other_key" }));

    const result = await forgetCredentials({ origin: ORIGIN }, popupSender);

    expect(result.revokedTabIds).toEqual([TAB]);
    await expect(getSession(OTHER_TAB)).resolves.toMatchObject({ origin: OTHER_ORIGIN });
  });

  it("refuses a request relayed by a content script", async () => {
    await expect(forgetCredentials({ origin: ORIGIN }, pageSender())).resolves.toEqual({
      ok: false,
      error: "Not allowed",
      revokedTabIds: [],
    });
  });

  it("refuses an origin it cannot canonicalize", async () => {
    await expect(forgetCredentials({ origin: "not-an-origin" }, popupSender)).resolves.toEqual({
      ok: false,
      error: "Invalid origin",
      revokedTabIds: [],
    });
  });

  it("refuses a request with no payload", async () => {
    await expect(forgetCredentials(undefined, popupSender)).resolves.toEqual({
      ok: false,
      error: "Invalid origin",
      revokedTabIds: [],
    });
  });

  it("reopens proxy work once the purge finishes", async () => {
    await openActiveSession();

    await forgetCredentials({ origin: ORIGIN }, popupSender);

    expect(isProxyRevoking(TAB)).toBe(false);
  });
});

describe("status for the popup", () => {
  it("reports an active session with the page's detection metadata", async () => {
    await openActiveSession();
    await putTabState(TAB, { comviDetected: true, version: "1.2.3" });

    await expect(getSessionStatus({ tabId: TAB }, popupSender)).resolves.toEqual({
      active: true,
      pending: false,
      comviDetected: true,
      version: "1.2.3",
    });
  });

  it("reports a pending session", async () => {
    await openPendingSession();

    await expect(getSessionStatus({ tabId: TAB }, popupSender)).resolves.toEqual({
      active: false,
      pending: true,
    });
  });

  it("refuses to answer a content script", async () => {
    await openActiveSession();
    await putTabState(TAB, { comviDetected: true });

    await expect(getSessionStatus({ tabId: TAB }, pageSender())).resolves.toEqual({
      active: false,
      pending: false,
    });
  });

  it("refuses a tab id that is not a number", async () => {
    await putTabState(TAB, { comviDetected: true });

    await expect(getSessionStatus({ tabId: String(TAB) }, popupSender)).resolves.toEqual({
      active: false,
      pending: false,
    });
  });

  it("refuses a request with no payload", async () => {
    await expect(getSessionStatus(undefined, popupSender)).resolves.toEqual({
      active: false,
      pending: false,
    });
  });
});
