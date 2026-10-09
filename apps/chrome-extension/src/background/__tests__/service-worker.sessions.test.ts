/**
 * Service worker integration: opening, promoting, ending and rolling back editor sessions, and who may ask for each.
 */
import { describe, it, expect, vi } from "vitest";
import { tabLockKey, withLock } from "../state";
import { sweepExpiredPendingSessions } from "../sessions";
import {
  TAB,
  ORIGIN,
  PAGE_URL,
  API_KEY,
  POPUP_LEASE,
  POLL,
  harness,
  popupLease,
  fetchMock,
  popupSender,
  pageSender,
  startSession,
  activate,
  proxyRequest,
  openActiveSession,
  broadcasts,
  deactivatedTabs,
  sessionStatus,
} from "./service-worker.suite";

describe("session lifecycle", () => {
  it("opens a pending session with a single-use nonce when the key validates", async () => {
    const started = await startSession();

    expect(started).toMatchObject({ ok: true, nonce: expect.any(String) });
  });

  // An activation-time request may arrive before the acknowledgement. It must
  // stay off the network until promotion, then pass the normal checks.
  it("keeps an activation-time request off the network while the session is pending", async () => {
    await startSession();

    void proxyRequest({ id: "activation-refresh" });
    await harness.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1); // key validation only
  });

  it("answers a held activation-time request once the session is promoted", async () => {
    const started = await startSession();
    const whilePending = proxyRequest({ id: "activation-refresh" });
    await harness.flush();

    await activate(started.nonce);

    await expect(whilePending).resolves.toMatchObject({ ok: true });
  });

  it("proxies an allowed call to the API with the stored key once active", async () => {
    await openActiveSession();

    const response = await proxyRequest();

    expect(response).toMatchObject({ ok: true, status: 200 });
    const proxiedCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(String(proxiedCall[0])).toBe("https://api.comvi.io/v1/project/locales");
    expect(proxiedCall[1].headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it("publishes authoritative activation completion for the popup", async () => {
    const started = await startSession();
    await activate(started.nonce);

    expect(harness.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SESSION_STATE_CHANGED",
        payload: expect.objectContaining({ tabId: TAB, active: true, pending: false }),
      }),
      expect.any(Function),
    );
  });

  it("returns cached detector metadata with authoritative session status", async () => {
    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { comviDetected: true, version: "0.4.0" } },
      pageSender(),
    );
    await harness.flush();

    await expect(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    ).resolves.toEqual({
      active: false,
      pending: false,
      comviDetected: true,
      version: "0.4.0",
    });
  });

  it("keeps a pending session when the rollback carries the wrong nonce", async () => {
    await startSession();

    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: "wrong" } },
      popupSender,
    );

    expect(await sessionStatus()).toMatchObject({ pending: true });
  });

  it("rolls a pending session back when the rollback carries its nonce", async () => {
    const started = await startSession();

    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
      popupSender,
    );

    expect(await sessionStatus()).toMatchObject({ active: false, pending: false });
  });

  it("key validation failure leaves no session and no stored credential", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const started = await startSession();
    expect(started).toMatchObject({ ok: false, error: "Invalid API key" });
    expect(harness.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
    expect(harness.chrome.storage.local.snapshot()).toEqual({});
  });

  it("keeps the session pending when acknowledgements carry no nonce or a wrong one", async () => {
    await startSession();

    await activate(undefined);
    await activate("wrong-nonce");

    expect(await sessionStatus()).toMatchObject({ active: false, pending: true });
  });

  it("denies the proxy after forged acknowledgements and a rollback", async () => {
    const started = await startSession();
    await activate(undefined);
    await activate("wrong-nonce");
    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
      popupSender,
    );

    const result = await proxyRequest();

    expect(result.networkError).toMatch(/No active editor session/);
  });

  it("activation failure with the nonce rolls the pending session back", async () => {
    const started = await startSession();
    await harness.dispatchMessage(
      { type: "EDITOR_ACTIVATED", payload: { success: false, nonce: started.nonce } },
      pageSender(),
    );
    await harness.flush();
    // Even a genuine activation afterwards must not resurrect it.
    await activate(started.nonce);
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
  });

  it("a pending session expires after the activation deadline", async () => {
    // Fake only Date so the harness's real setTimeout-based flushing keeps working.
    vi.useFakeTimers({ toFake: ["Date"] });
    const started = await startSession();
    vi.setSystemTime(Date.now() + 31_000);
    await activate(started.nonce);
    const result = await proxyRequest();
    expect(result.networkError).toMatch(/No active editor session/);
  });

  it("proactively sweeps expired pending records without a proxy access", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await startSession();
    vi.setSystemTime(Date.now() + 31_000);

    await expect(sweepExpiredPendingSessions()).resolves.toBe(1);
    expect(harness.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
    expect(harness.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "", tabId: TAB });
  });

  it("automatically removes a pending record when its activation deadline elapses", async () => {
    vi.useFakeTimers();
    await startSession();

    await vi.advanceTimersByTimeAsync(30_001);

    expect(harness.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
    expect(harness.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "", tabId: TAB });
  });

  it("deactivation from the session origin revokes authority", async () => {
    await openActiveSession();
    await harness.dispatchMessage(
      { type: "EDITOR_DEACTIVATED", payload: { success: true } },
      pageSender(),
    );
    await harness.flush();
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
  });

  it("a stale-document deactivation event cannot revoke the current session", async () => {
    await openActiveSession();
    await harness.dispatchMessage(
      { type: "EDITOR_DEACTIVATED", payload: { success: true } },
      pageSender({ documentId: "stale-doc" }),
    );
    await harness.flush();
    expect((await proxyRequest()).ok).toBe(true);
  });

  it("denies a request racing a deactivation without any network access", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    let releaseLock!: () => void;
    const blocker = withLock(
      tabLockKey(TAB),
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    );
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"), POLL);

    const pendingProxy = proxyRequest({ id: "race-deactivation" });
    await harness.dispatchMessage(
      {
        type: "EDITOR_DEACTIVATED",
        payload: { success: true, instanceId: "editor-1", collectContext: false },
      },
      pageSender(),
    );
    releaseLock();
    await blocker;

    await expect(pendingProxy).resolves.toMatchObject({
      networkError: "No active editor session for this tab",
    });
    await harness.flush();
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("navigation revokes the session before the next document can use it", async () => {
    await openActiveSession();
    await harness.fireDocumentReady(TAB);
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
  });

  it("tab removal deletes all session material", async () => {
    await openActiveSession();
    harness.fireTabRemoved(TAB);
    await harness.flush();
    const remaining = Object.keys(harness.chrome.storage.session.snapshot());
    expect(remaining.filter((k) => k.includes(String(TAB)))).toEqual([]);
  });

  it("navigation during key validation prevents session creation", async () => {
    let releaseValidation!: () => void;
    fetchMock.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          if (String(url).endsWith("/v1/project")) {
            releaseValidation = () =>
              resolve(new Response(JSON.stringify({ id: 42 }), { status: 200 }));
          } else {
            resolve(new Response("{}", { status: 200 }));
          }
        }),
    );

    const pending = startSession();
    // Let START_SESSION reach the in-flight validation fetch first.
    await harness.flush();
    await harness.fireDocumentReady(TAB); // document boundary bumps the generation
    releaseValidation();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(harness.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
  });

  it("END_SESSION from the popup revokes a pending session (rollback path)", async () => {
    const started = await startSession();
    await harness.dispatchMessage({ type: "END_SESSION", payload: { tabId: TAB } }, popupSender);
    await activate(started.nonce);
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
    expect(harness.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      TAB,
      { type: "DEACTIVATE_EDITOR" },
      expect.any(Function),
    );
  });

  it("popup Port disconnect immediately revokes its pending activation", async () => {
    const started = await startSession();
    popupLease.disconnect();
    await harness.flush();
    await activate(started.nonce);
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
  });

  it("popup disconnect queued against activation prevents promotion", async () => {
    const started = await startSession();
    let releaseLock!: () => void;
    const blocker = withLock(
      tabLockKey(TAB),
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    );
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"), POLL);

    const pendingActivation = activate(started.nonce);
    popupLease.disconnect();
    releaseLock();
    await blocker;
    await pendingActivation;
    await harness.flush();

    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
  });

  it("navigation queued before activation cannot be overwritten by the acknowledgement", async () => {
    const started = await startSession();
    const navigation = harness.fireDocumentReady(TAB);
    await activate(started.nonce);
    await navigation;
    await harness.flush();
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
    const badgeCalls = harness.chrome.action.setBadgeText.mock.calls;
    const finalBadge = badgeCalls[badgeCalls.length - 1]?.[0] as { text?: string } | undefined;
    expect(finalBadge?.text).toBe("");
  });
});

describe("sender enforcement", () => {
  it("content scripts cannot open sessions", async () => {
    const result = (await harness.dispatchMessage(
      {
        type: "START_SESSION",
        payload: {
          tabId: TAB,
          origin: ORIGIN,
          apiKey: API_KEY,
          popupLeaseId: POPUP_LEASE,
        },
      },
      pageSender(),
    )) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it("rejects proxy requests from subframes", async () => {
    await openActiveSession();
    const result = await proxyRequest({}, pageSender({ frameId: 3 }));
    expect(result.networkError).toMatch(/top frame/);
  });

  it("rejects proxy requests from a mismatched origin", async () => {
    await openActiveSession();
    const result = await proxyRequest({}, pageSender({ origin: "https://evil.example" }));
    expect(result.networkError).toMatch(/Origin mismatch/);
  });

  it("rejects proxy requests from a stale document", async () => {
    await openActiveSession();
    const result = await proxyRequest({}, pageSender({ documentId: "doc-2" }));
    expect(result.networkError).toMatch(/Stale document/);
  });

  it("rejects proxy requests from another tab", async () => {
    await openActiveSession();
    const result = await proxyRequest({}, pageSender({ tab: { id: TAB + 1 } as chrome.tabs.Tab }));
    expect(result.networkError).toMatch(/No active editor session/);
  });

  it("keeps the session pending when the acknowledgement comes from another origin", async () => {
    const started = await startSession();

    await activate(started.nonce, pageSender({ origin: "https://evil.example" }));

    expect(await sessionStatus()).toMatchObject({ active: false, pending: true });
  });

  it("denies the proxy after a cross-origin acknowledgement and a rollback", async () => {
    const started = await startSession();
    await activate(started.nonce, pageSender({ origin: "https://evil.example" }));
    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
      popupSender,
    );

    const result = await proxyRequest();

    expect(result.networkError).toMatch(/No active editor session/);
  });
});

describe("closed-tab toolbar races", () => {
  it("does not emit an unhandled warning when Chrome removes the tab before icon rendering", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    harness.chrome.action.setIcon.mockRejectedValueOnce(new Error(`No tab with id: ${TAB}.`));

    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { comviDetected: true, version: "0.4.0" } },
      pageSender(),
    );
    await harness.flush();

    expect(harness.chrome.action.setIcon).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("origin policy", () => {
  it.each([
    "http://localhost.evil.com",
    "http://localhost@evil.com",
    "http://plain-http.example.com",
    "https://app.example.com/path",
    "not-a-url",
  ])("rejects session origin %s", async (origin) => {
    harness.setTabUrl(TAB, `${origin}/page`);
    const result = await startSession({ origin });
    expect(result.ok).toBe(false);
  });

  it("accepts loopback http for local development", async () => {
    harness.setTabUrl(TAB, "http://localhost:5173/app");
    const result = await startSession({ origin: "http://localhost:5173" });
    expect(result.ok).toBe(true);
  });

  it("rejects a session whose tab shows a different origin", async () => {
    harness.setTabUrl(TAB, "https://other.example.com/page");
    const result = await startSession();
    expect(result.ok).toBe(false);
  });
});

describe("storage concurrency", () => {
  it("keeps one tab's session working when a parallel session on another tab is revoked", async () => {
    const TAB2 = 11;
    harness.setTabUrl(TAB2, PAGE_URL);

    const [first, second] = await Promise.all([startSession(), startSession({ tabId: TAB2 })]);
    await activate(first.nonce);
    await activate(second.nonce, pageSender({ tab: { id: TAB2 } as chrome.tabs.Tab }));

    harness.fireTabRemoved(TAB2);
    await harness.flush();

    expect((await proxyRequest()).ok).toBe(true);
  });

  it("parallel credential writes for different origins preserve both entries", async () => {
    const TAB2 = 13;
    const ORIGIN2 = "https://parallel.example.com";
    harness.setTabUrl(TAB2, `${ORIGIN2}/page`);

    const [first, second] = await Promise.all([
      startSession(),
      startSession({ tabId: TAB2, origin: ORIGIN2 }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const credentials = harness.chrome.storage.local.snapshot()["comvi_credentials"] as Record<
      string,
      unknown
    >;
    expect(Object.keys(credentials).sort()).toEqual([ORIGIN, ORIGIN2].sort());
  });
});

describe("popup lease registration", () => {
  it("confirms a registration back over the port", () => {
    const port = harness.openPopupLease("popup-lease-confirm-1");

    expect(port.postMessage).toHaveBeenCalledWith({
      type: "POPUP_REGISTERED",
      leaseId: "popup-lease-confirm-1",
    });
  });

  it("ignores a port opened on another channel", async () => {
    const port = harness.connectPort({ name: "some-other-channel" });
    port.send({ type: "REGISTER_POPUP", leaseId: "popup-lease-other-0001" });

    expect(port.postMessage).not.toHaveBeenCalled();
    await expect(startSession({ popupLeaseId: "popup-lease-other-0001" })).resolves.toEqual({
      ok: false,
      error: "Malformed session request",
    });
  });

  it("ignores a popup channel port opened from a tab", () => {
    const port = harness.connectPort({
      sender: { tab: { id: TAB } as chrome.tabs.Tab } as chrome.runtime.MessageSender,
    });

    port.send({ type: "REGISTER_POPUP", leaseId: "popup-lease-fromtab-01" });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("accepts a popup channel port that reports no sender", () => {
    const port = harness.connectPort({ sender: null as unknown as chrome.runtime.MessageSender });

    port.send({ type: "REGISTER_POPUP", leaseId: "popup-lease-nosender1" });

    expect(port.postMessage).toHaveBeenCalledWith({
      type: "POPUP_REGISTERED",
      leaseId: "popup-lease-nosender1",
    });
  });

  it("ignores a port message that is not an object", () => {
    const port = harness.connectPort();

    expect(() => port.send(undefined)).not.toThrow();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("ignores a port message of another type", () => {
    const port = harness.connectPort();

    port.send({ type: "SOMETHING_ELSE", leaseId: "popup-lease-wrongtype" });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("ignores a registration whose lease id is not a string", () => {
    const port = harness.connectPort();

    port.send({ type: "REGISTER_POPUP", leaseId: 1234 });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("ignores a lease id shorter than 16 characters", () => {
    const port = harness.connectPort();

    port.send({ type: "REGISTER_POPUP", leaseId: "a".repeat(15) });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("accepts a lease id of exactly 16 characters", () => {
    const port = harness.connectPort();

    port.send({ type: "REGISTER_POPUP", leaseId: "a".repeat(16) });

    expect(port.postMessage).toHaveBeenCalled();
  });

  it("ignores a lease id longer than 128 characters", () => {
    const port = harness.connectPort();

    port.send({ type: "REGISTER_POPUP", leaseId: "a".repeat(129) });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("accepts a lease id of exactly 128 characters", () => {
    const port = harness.connectPort();

    port.send({ type: "REGISTER_POPUP", leaseId: "a".repeat(128) });

    expect(port.postMessage).toHaveBeenCalled();
  });
});

describe("popup lease disconnect", () => {
  it("drops the pending session the disconnected popup owned", async () => {
    await startSession();

    popupLease.disconnect();
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ active: false, pending: false });
  });

  it("keeps the session when a superseded port for the same lease disconnects", async () => {
    const sharedLease = "popup-lease-shared-01";
    const first = harness.openPopupLease(sharedLease);
    harness.openPopupLease(sharedLease);
    await startSession({ popupLeaseId: sharedLease });

    first.disconnect();
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ pending: true });
  });
});

describe("ROLLBACK_ACTIVATION", () => {
  it("publishes the rolled-back state and tears the editor down", async () => {
    const started = await startSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    const response = await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
      popupSender,
    );

    expect(response).toEqual({ ok: true });
    expect(broadcasts()).toEqual([
      { tabId: TAB, active: false, pending: false, comviDetected: false },
    ]);
    expect(deactivatedTabs()).toEqual([TAB]);
  });

  it("leaves an active session alone when the nonce does not match", async () => {
    await openActiveSession();
    harness.chrome.tabs.sendMessage.mockClear();

    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: "forged" } },
      popupSender,
    );

    expect(deactivatedTabs()).toEqual([]);
    expect(await sessionStatus()).toMatchObject({ active: true });
  });

  it("refuses a rollback relayed by a content script", async () => {
    const response = await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: "n" } },
      pageSender(),
    );

    expect(response).toEqual({ ok: false });
  });

  it("refuses a rollback without a numeric tab id", async () => {
    const response = await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { nonce: "n" } },
      popupSender,
    );

    expect(response).toEqual({ ok: false });
  });
});

describe("END_SESSION", () => {
  it("publishes the revoked state and tears the editor down", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    const response = await harness.dispatchMessage(
      { type: "END_SESSION", payload: { tabId: TAB } },
      popupSender,
    );

    expect(response).toEqual({ ok: true });
    expect(broadcasts()).toEqual([{ tabId: TAB, active: false, pending: false }]);
    expect(deactivatedTabs()).toEqual([TAB]);
  });

  it("refuses a request relayed by a content script", async () => {
    const response = await harness.dispatchMessage(
      { type: "END_SESSION", payload: { tabId: TAB } },
      pageSender(),
    );

    expect(response).toEqual({ ok: false });
  });

  it("refuses a request with no payload", async () => {
    const response = await harness.dispatchMessage({ type: "END_SESSION" }, popupSender);

    expect(response).toEqual({ ok: false });
  });
});

describe("EDITOR_ACTIVATED routing", () => {
  it("publishes an activation without an error", async () => {
    const started = await startSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    await activate(started.nonce);

    expect(broadcasts()).toEqual([
      { tabId: TAB, active: true, pending: false, comviDetected: false },
    ]);
    expect(deactivatedTabs()).toEqual([]);
  });

  it("publishes an unconfirmed activation with an error and tears the editor down", async () => {
    await startSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    await activate("forged-nonce");

    expect(broadcasts()).toEqual([
      {
        tabId: TAB,
        active: false,
        pending: true,
        comviDetected: false,
        error: "The editor activation could not be confirmed. Try again.",
      },
    ]);
    expect(deactivatedTabs()).toEqual([TAB]);
  });

  it("publishes the reported reason when activation failed", async () => {
    const started = await startSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    await harness.dispatchMessage(
      {
        type: "EDITOR_ACTIVATED",
        payload: { success: false, nonce: started.nonce, error: "Editor bundle failed to load" },
      },
      pageSender(),
    );
    await harness.flush();

    expect(broadcasts()).toEqual([
      {
        tabId: TAB,
        active: false,
        pending: false,
        comviDetected: false,
        error: "Editor bundle failed to load",
      },
    ]);
    expect(deactivatedTabs()).toEqual([TAB]);
  });

  it("publishes a default reason when activation failed without one", async () => {
    const started = await startSession();
    harness.chrome.runtime.sendMessage.mockClear();

    await harness.dispatchMessage(
      { type: "EDITOR_ACTIVATED", payload: { success: false, nonce: started.nonce } },
      pageSender(),
    );
    await harness.flush();

    expect(broadcasts()).toEqual([
      {
        tabId: TAB,
        active: false,
        pending: false,
        comviDetected: false,
        error: "The editor could not be enabled.",
      },
    ]);
  });
});

describe("EDITOR_DEACTIVATED routing", () => {
  it("publishes the revoked state", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();

    await harness.dispatchMessage({ type: "EDITOR_DEACTIVATED" }, pageSender());
    await harness.flush();

    expect(broadcasts()).toEqual([{ tabId: TAB, active: false, pending: false }]);
  });

  it("publishes nothing for a stale-document event", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();

    await harness.dispatchMessage(
      { type: "EDITOR_DEACTIVATED" },
      pageSender({ documentId: "doc-9" }),
    );
    await harness.flush();

    expect(broadcasts()).toEqual([]);
    expect(await sessionStatus()).toMatchObject({ active: true });
  });
});
