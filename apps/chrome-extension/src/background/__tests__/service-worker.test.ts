/**
 * Trust-boundary integration tests: drive the REAL service-worker message
 * routing (session state machine + proxy authorization) through a fake
 * chrome.* API and a mocked network. Complements the pure-function suites in
 * src/shared/__tests__.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { installFakeChrome, type Harness } from "./harness";
import { tabLockKey, withLock } from "../state";
import { CURRENT_STORAGE_SCHEMA_VERSION, STORAGE_SCHEMA_KEY } from "../../shared/storage";
import { sweepExpiredPendingSessions } from "../sessions";

const TAB = 7;
const ORIGIN = "https://app.example.com";
const PAGE_URL = `${ORIGIN}/dashboard`;
const API_KEY = "cmv_test_key_123";
const POPUP_LEASE = "popup-lease-test-0001";

let harness: Harness;
let popupLease: { disconnect(): void };

// Deterministic network: /v1/project validates the key, everything else 200s.
const fetchMock = vi.fn();

function mockApiOk(projectId: number | string = 42) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/v1/project")) {
      return new Response(JSON.stringify({ id: projectId, name: "Demo" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
}

beforeAll(async () => {
  harness = installFakeChrome();
  vi.stubGlobal("fetch", fetchMock);
  // Import AFTER the fakes exist — the module registers listeners on import.
  await import("../service-worker");
});

beforeEach(async () => {
  harness.reset();
  fetchMock.mockReset();
  mockApiOk();
  harness.setTabUrl(TAB, PAGE_URL);
  await harness.fireDocumentReady(TAB, "doc-1");
  popupLease = harness.openPopupLease(POPUP_LEASE);
});

afterEach(() => {
  vi.useRealTimers();
});

// --- helpers ---

const popupSender: chrome.runtime.MessageSender = {} as chrome.runtime.MessageSender;

function pageSender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    tab: { id: TAB } as chrome.tabs.Tab,
    frameId: 0,
    origin: ORIGIN,
    documentId: "doc-1",
    ...overrides,
  } as chrome.runtime.MessageSender;
}

async function startSession(overrides: Record<string, unknown> = {}) {
  return (await harness.dispatchMessage(
    {
      type: "START_SESSION",
      payload: {
        tabId: TAB,
        origin: ORIGIN,
        apiKey: API_KEY,
        popupLeaseId: POPUP_LEASE,
        ...overrides,
      },
    },
    popupSender,
  )) as { ok: boolean; error?: string; nonce?: string };
}

async function activate(
  nonce: string | undefined,
  sender = pageSender(),
  activation: Record<string, unknown> = {},
) {
  await harness.dispatchMessage(
    { type: "EDITOR_ACTIVATED", payload: { success: true, nonce, ...activation } },
    sender,
  );
  await harness.flush();
}

async function proxyRequest(
  payload: Record<string, unknown> = {},
  sender = pageSender(),
): Promise<{ ok: boolean; status: number; networkError?: string }> {
  return (await harness.dispatchMessage(
    {
      type: "API_PROXY_REQUEST",
      payload: { id: "r1", path: "/v1/project/locales", method: "GET", ...payload },
    },
    sender,
  )) as { ok: boolean; status: number; networkError?: string };
}

async function openActiveSession(): Promise<string> {
  const started = await startSession();
  expect(started.ok).toBe(true);
  await activate(started.nonce);
  return started.nonce!;
}

// --- session lifecycle ---

describe("session lifecycle", () => {
  it("full happy path: validate -> pending -> activate -> proxy works", async () => {
    const started = await startSession();
    expect(started.ok).toBe(true);
    expect(started.nonce).toBeTruthy();

    // An activation-time request may arrive before the acknowledgement. It
    // must remain network-silent until promotion, then pass normal checks.
    const whilePending = proxyRequest({ id: "activation-refresh" });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1); // key validation only
    await activate(started.nonce);
    const promotedRequest = await whilePending;
    expect(promotedRequest.ok).toBe(true);

    const afterActivation = await proxyRequest();
    expect(afterActivation.ok).toBe(true);
    expect(afterActivation.status).toBe(200);

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

  it("rolls back only the pending activation with the matching nonce", async () => {
    const started = await startSession();
    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: "wrong" } },
      popupSender,
    );
    await expect(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    ).resolves.toMatchObject({ pending: true });

    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
      popupSender,
    );
    await expect(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    ).resolves.toMatchObject({ active: false, pending: false });
  });

  it("key validation failure leaves no session and no stored credential", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const started = await startSession();
    expect(started).toMatchObject({ ok: false, error: "Invalid API key" });
    expect(harness.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
    expect(harness.chrome.storage.local.snapshot()).toEqual({});
  });

  it("a forged activation without the nonce cannot promote the session", async () => {
    const started = await startSession();
    await activate(undefined);
    await activate("wrong-nonce");

    await expect(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    ).resolves.toMatchObject({ active: false, pending: true });

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

  it("deactivation gates authority before its first storage read", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    let releaseLock!: () => void;
    const blocker = withLock(
      tabLockKey(TAB),
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    );
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"));

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
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
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
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"));

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

describe("extension update migration", () => {
  it("clears authority and incompatible credentials while preserving unrelated preferences", async () => {
    await openActiveSession();
    await harness.chrome.storage.local.set({
      [STORAGE_SCHEMA_KEY]: 999,
      comvi_credentials: { [ORIGIN]: { apiKey: API_KEY, validated: true } },
      comvi_theme: "dark",
    });

    harness.fireInstalled("update");
    await harness.flush();

    expect(harness.chrome.storage.session.snapshot()).toEqual({});
    expect(harness.chrome.storage.local.snapshot()).toMatchObject({
      [STORAGE_SCHEMA_KEY]: CURRENT_STORAGE_SCHEMA_VERSION,
      comvi_credentials: {},
      comvi_theme: "dark",
    });
    expect(harness.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "", tabId: TAB });
    expect(harness.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      TAB,
      { type: "DEACTIVATE_EDITOR" },
      expect.any(Function),
    );
  });

  it("preserves compatible credentials but still revokes active sessions on update", async () => {
    await openActiveSession();
    harness.fireInstalled("update");
    await harness.flush();

    expect(harness.chrome.storage.session.snapshot()).toEqual({});
    expect(harness.chrome.storage.local.snapshot()).toMatchObject({
      [STORAGE_SCHEMA_KEY]: CURRENT_STORAGE_SCHEMA_VERSION,
      comvi_credentials: { [ORIGIN]: { apiKey: API_KEY, validated: true } },
    });
    expect(harness.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      TAB,
      { type: "DEACTIVATE_EDITOR" },
      expect.any(Function),
    );
  });
});

// --- sender enforcement ---

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

  it("activation ack from a different origin cannot promote", async () => {
    const started = await startSession();
    await activate(started.nonce, pageSender({ origin: "https://evil.example" }));

    await expect(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    ).resolves.toMatchObject({ active: false, pending: true });

    await harness.dispatchMessage(
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
      popupSender,
    );
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
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

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// --- origin canonicalization ---

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

// --- proxy authorization + telemetry ---

describe("proxy authorization", () => {
  it("unrelated routes are rejected locally without any network access", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    for (const path of ["/v1/organizations", "/v1/api-keys", "/v1/admin/users"]) {
      const result = await proxyRequest({ path });
      expect(result.ok).toBe(false);
    }
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("telemetry routes stay closed when activation does not enable collection", async () => {
    await openActiveSession();
    const result = await proxyRequest({
      path: "/v1/context/handshake",
      method: "POST",
      body: JSON.stringify({ keys: [] }),
    });
    expect(result.networkError).toMatch(/telemetry is disabled/);
  });

  it("telemetry routes open when the effective SDK config enables collection", async () => {
    const started = await startSession();
    await activate(started.nonce, pageSender(), { collectContext: true });
    const result = await proxyRequest({
      path: "/v1/context/usages",
      method: "POST",
      body: JSON.stringify({ origin: ORIGIN, hashFnVersion: 1, items: [], stillValid: [] }),
    });
    expect(result.ok).toBe(true);
  });

  it("effective SDK config can disable collection", async () => {
    const started = await startSession();
    await activate(started.nonce, pageSender(), { collectContext: false });
    const result = await proxyRequest({
      path: "/v1/context/handshake",
      method: "POST",
      body: JSON.stringify({ keys: [] }),
    });
    expect(result.networkError).toMatch(/telemetry is disabled/);
  });

  it("export routes are bound to the validated project id", async () => {
    await openActiveSession(); // project id 42 from mockApiOk
    const allowed = await proxyRequest({
      path: "/v1/projects/42/export?locales=en&namespaces=common",
    });
    expect(allowed.ok).toBe(true);
    const denied = await proxyRequest({
      path: "/v1/projects/999/export?locales=en&namespaces=common",
    });
    expect(denied.ok).toBe(false);
  });

  it("does not start a proxy fetch when END_SESSION queues during pre-registration", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    let releaseLock!: () => void;
    const blocker = withLock(
      tabLockKey(TAB),
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    );
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"));

    const pendingProxy = proxyRequest({ id: "race-end" });
    const pendingEnd = harness.dispatchMessage(
      { type: "END_SESSION", payload: { tabId: TAB } },
      popupSender,
    );
    releaseLock();
    await blocker;

    await expect(pendingEnd).resolves.toMatchObject({ ok: true });
    await expect(pendingProxy).resolves.toMatchObject({
      networkError: "No active editor session for this tab",
    });
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("does not start a proxy fetch when navigation queues during pre-registration", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    let releaseLock!: () => void;
    const blocker = withLock(
      tabLockKey(TAB),
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    );
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"));

    const pendingProxy = proxyRequest({ id: "race-navigation" });
    const navigation = harness.fireDocumentReady(TAB);
    releaseLock();
    await blocker;
    await navigation;

    await expect(pendingProxy).resolves.toMatchObject({
      networkError: "No active editor session for this tab",
    });
    await harness.flush();
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("does not start a proxy fetch when Forget queues during pre-registration", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    let releaseLock!: () => void;
    const blocker = withLock(
      tabLockKey(TAB),
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    );
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"));

    const pendingProxy = proxyRequest({ id: "race-forget" });
    const pendingForget = harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    );
    releaseLock();
    await blocker;

    await expect(pendingForget).resolves.toMatchObject({ ok: true });
    await expect(pendingProxy).resolves.toMatchObject({
      networkError: "No active editor session for this tab",
    });
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("aborts an authenticated request already in flight when the session is revoked", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    let observedAbort = false;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          observedAbort = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const pendingProxy = proxyRequest({ id: "inflight-revoke" });
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 1));
    const ended = harness.dispatchMessage(
      { type: "END_SESSION", payload: { tabId: TAB } },
      popupSender,
    );

    await expect(ended).resolves.toMatchObject({ ok: true });
    await expect(pendingProxy).resolves.toMatchObject({ networkError: "Request aborted" });
    expect(observedAbort).toBe(true);
  });
});

// --- credential revocation ---

describe("FORGET_CREDENTIALS", () => {
  it("clears the credential and revokes every session for the origin", async () => {
    await openActiveSession();
    expect(Object.keys(harness.chrome.storage.local.snapshot())).not.toEqual([]);

    const result = (await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);

    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
    const credentials = harness.chrome.storage.local.snapshot()["comvi_credentials"] as
      | Record<string, unknown>
      | undefined;
    expect(credentials?.[ORIGIN]).toBeUndefined();
  });

  it("is refused for content scripts", async () => {
    await openActiveSession();
    const result = (await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      pageSender(),
    )) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect((await proxyRequest()).ok).toBe(true); // session untouched
  });

  it("invalidates START_SESSION validation already in flight", async () => {
    await openActiveSession();
    const TAB2 = 11;
    harness.setTabUrl(TAB2, PAGE_URL);

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

    const pendingStart = startSession({ tabId: TAB2 });
    await harness.flush();
    const forgotten = harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    );
    await harness.flush();
    releaseValidation();

    expect(await forgotten).toMatchObject({ ok: true });
    expect(await pendingStart).toMatchObject({ ok: false });
    expect((await proxyRequest()).networkError).toMatch(/No active editor session/);
  });

  it("revokes sessions on other origins that use the same API key", async () => {
    await openActiveSession();
    const TAB2 = 12;
    const ORIGIN2 = "https://second.example.com";
    harness.setTabUrl(TAB2, `${ORIGIN2}/page`);
    const second = await startSession({ tabId: TAB2, origin: ORIGIN2 });
    await activate(
      second.nonce,
      pageSender({ tab: { id: TAB2 } as chrome.tabs.Tab, origin: ORIGIN2, documentId: "doc-2" }),
    );

    await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    );
    const secondStatus = await harness.dispatchMessage(
      { type: "GET_SESSION_STATUS", payload: { tabId: TAB2 } },
      popupSender,
    );
    expect(secondStatus).toEqual({ active: false, pending: false });
    const credentials = harness.chrome.storage.local.snapshot()["comvi_credentials"] as
      | Record<string, { apiKey?: string }>
      | undefined;
    expect(Object.values(credentials ?? {}).some((entry) => entry.apiKey === API_KEY)).toBe(false);
    expect(harness.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      TAB,
      { type: "DEACTIVATE_EDITOR" },
      expect.any(Function),
    );
    expect(harness.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      TAB2,
      { type: "DEACTIVATE_EDITOR" },
      expect.any(Function),
    );
  });
});

// --- badge trust ---

describe("badge derivation", () => {
  it("page-forged detection/activation events cannot set the ON badge", async () => {
    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { comviDetected: true, editorActive: true } },
      pageSender(),
    );
    await harness.dispatchMessage(
      { type: "EDITOR_ACTIVATED", payload: { success: true } },
      pageSender(),
    );
    await harness.flush();

    const badgeCalls = harness.chrome.action.setBadgeText.mock.calls;
    expect(badgeCalls.length).toBeGreaterThan(0);
    for (const [args] of badgeCalls) {
      expect((args as { text: string }).text).toBe("");
    }
  });

  it("the ON badge appears only after a genuine activation", async () => {
    await openActiveSession();
    const badgeTexts = harness.chrome.action.setBadgeText.mock.calls.map(
      (call) => (call[0] as { text: string }).text,
    );
    expect(badgeTexts).toContain("ON");
  });
});

describe("same-document SPA navigation", () => {
  it("treats a repeated signal from the same document as idempotent", async () => {
    await openActiveSession();

    await harness.fireDocumentReady(TAB, "doc-1");

    const status = await harness.dispatchMessage(
      { type: "GET_SESSION_STATUS", payload: { tabId: TAB } },
      popupSender,
    );
    expect(status).toMatchObject({ active: true, pending: false });
    await expect(proxyRequest()).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("preserves the active editor session when History API changes only the tab URL", async () => {
    await openActiveSession();

    harness.setTabUrl(TAB, `${ORIGIN}/another-route`);
    harness.fireTabUpdated(TAB, { url: `${ORIGIN}/another-route` });
    await harness.flush();

    const status = await harness.dispatchMessage(
      { type: "GET_SESSION_STATUS", payload: { tabId: TAB } },
      popupSender,
    );
    expect(status).toMatchObject({ active: true, pending: false });
    await expect(proxyRequest()).resolves.toMatchObject({ ok: true, status: 200 });
  });
});

// --- storage concurrency ---

describe("storage concurrency", () => {
  it("parallel sessions on different tabs do not clobber each other", async () => {
    const TAB2 = 11;
    harness.setTabUrl(TAB2, PAGE_URL);

    const [first, second] = await Promise.all([startSession(), startSession({ tabId: TAB2 })]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    await activate(first.nonce);
    await activate(second.nonce, pageSender({ tab: { id: TAB2 } as chrome.tabs.Tab }));

    // Revoking one tab's session leaves the other fully functional.
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
