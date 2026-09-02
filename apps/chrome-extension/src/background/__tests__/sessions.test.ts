/**
 * The proxy-session state machine, driven directly rather than through
 * message routing: API key validation, the two-phase pending -> active
 * promotion, and every revocation path.
 *
 * Each guard is exercised on its own, because they are the difference
 * between an editor session and an authorization bug: a session must never
 * outlive the tab, document, origin or popup it was created for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeChrome, type Harness } from "./harness";
import {
  PENDING_TTL_MS,
  confirmActivation,
  forgetCredentials,
  getLiveSession,
  getSessionStatus,
  revokePendingForLease,
  revokeSession,
  revokeSessionFromSender,
  rollbackPending,
  startSession,
  sweepExpiredPendingSessions,
} from "../sessions";
import {
  bumpAuthorityEpoch,
  bumpNavGen,
  getSession,
  putSession,
  putTabState,
  tabLockKey,
  withLock,
  type SessionRecord,
} from "../state";
import { getProxySessionTransitionGeneration, isProxyRevoking } from "../proxy-work";
import { setCredentials, getAllCredentials } from "../../shared/storage";

const TAB = 5;
const OTHER_TAB = 6;
const ORIGIN = "https://app.example.com";
const PAGE_URL = `${ORIGIN}/dashboard`;
const OTHER_ORIGIN = "https://other.example.com";
const API_KEY = "cmv_test_key_123";
const LEASE = "popup-lease-test-0001";
const API = "https://api.comvi.io";

/** A popup sender: extension pages have no `tab`. */
const popupSender = {} as chrome.runtime.MessageSender;

function pageSender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    tab: { id: TAB } as chrome.tabs.Tab,
    frameId: 0,
    origin: ORIGIN,
    documentId: "doc-1",
    ...overrides,
  } as chrome.runtime.MessageSender;
}

let harness: Harness;
let fetchMock: ReturnType<typeof vi.fn>;

/** Validate every key successfully unless a test says otherwise. */
function apiValidates(projectId: unknown = 42) {
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ id: projectId }), { status: 200 }),
  );
}

beforeEach(() => {
  harness = installFakeChrome();
  harness.setTabUrl(TAB, PAGE_URL);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  apiValidates();
});

afterEach(() => {
  vi.useRealTimers();
});

function payload(overrides: Record<string, unknown> = {}) {
  return { tabId: TAB, origin: ORIGIN, apiKey: API_KEY, popupLeaseId: LEASE, ...overrides };
}

async function openPendingSession(): Promise<string> {
  const started = await startSession(payload(), popupSender);
  if (!started.ok || !started.nonce) throw new Error(`session not opened: ${started.error}`);
  return started.nonce;
}

async function openActiveSession(): Promise<string> {
  const nonce = await openPendingSession();
  const promoted = await confirmActivation(TAB, pageSender(), nonce, true, () => true);
  if (!promoted) throw new Error("session not promoted");
  return nonce;
}

function storedSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    status: "active",
    origin: ORIGIN,
    apiKey: API_KEY,
    collectContext: false,
    nonce: "nonce-1",
    popupLeaseId: LEASE,
    navGen: 0,
    expiresAt: 0,
    ...overrides,
  };
}

/** Let every already-scheduled microtask and timer callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Occupy the tab's mutation lock so a caller queues behind it, leaving a window
 * in which the stored record can change after it was enumerated.
 */
function holdTabLock() {
  let release!: () => void;
  const done = withLock(
    tabLockKey(TAB),
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  return { done, release: () => release() };
}

/** The single icon path the fake recorded last, e.g. to tell detected from inactive. */
function lastIconPath(): string {
  const calls = harness.chrome.action.setIcon.mock.calls;
  const [last] = calls[calls.length - 1] as [{ path: Record<number, string> }];
  return last.path[16];
}

describe("API key validation", () => {
  it("sends the key as a bearer token to the canonical project route", async () => {
    await startSession(payload(), popupSender);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/v1/project`);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
  });

  it("falls back to the legacy deployment route when the canonical one is missing", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/v1/project")
        ? new Response(null, { status: 404 })
        : new Response(JSON.stringify({ id: 42 }), { status: 200 }),
    );

    const started = await startSession(payload(), popupSender);

    expect(started.ok).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/api/v1/api/project`);
  });

  it("reports an invalid key when the API rejects the credentials", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Invalid API key",
    });
  });

  it("reports an invalid key when the API forbids the credentials", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 403 }));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Invalid API key",
    });
  });

  it("surfaces an unexpected API status", async () => {
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "API error: 500 Internal Server Error",
    });
  });

  it("reports a missing endpoint when neither project route exists", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Comvi API endpoint not found",
    });
  });

  it("reports an unreachable API", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Could not reach the Comvi API. Check your connection.",
    });
  });

  it("gives up on an API that does not answer in time", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );

    const started = startSession(payload(), popupSender);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(started).resolves.toEqual({
      ok: false,
      error: "The Comvi API did not respond in time. Try again.",
    });
  });

  it("cancels the validation deadline once the API has answered", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));

    await startSession(payload(), popupSender);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("binds the session to a string project id", async () => {
    apiValidates("project-1");

    await openPendingSession();

    await expect(getSession(TAB)).resolves.toMatchObject({ projectId: "project-1" });
  });

  it("binds the session to a numeric project id", async () => {
    apiValidates(7);

    await openPendingSession();

    await expect(getSession(TAB)).resolves.toMatchObject({ projectId: 7 });
  });

  it("leaves the session unbound when the project id is neither string nor number", async () => {
    apiValidates(true);

    await openPendingSession();

    expect((await getSession(TAB))?.projectId).toBeUndefined();
  });

  it("accepts a validating response whose body is not JSON", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>ok</html>", { status: 200 }));

    await openPendingSession();

    expect((await getSession(TAB))?.projectId).toBeUndefined();
  });
});

describe("opening a session", () => {
  it("refuses a session request relayed by a content script", async () => {
    await expect(startSession(payload(), pageSender())).resolves.toEqual({
      ok: false,
      error: "Not allowed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a tab id that is not a number", { tabId: "5" }],
    ["a fractional tab id", { tabId: 5.5 }],
    ["an api key that is not a string", { apiKey: 123 }],
    ["an empty api key", { apiKey: "" }],
    ["an api key longer than 512 characters", { apiKey: "k".repeat(513) }],
    ["a popup lease that is not a string", { popupLeaseId: 42 }],
    ["a popup lease shorter than 16 characters", { popupLeaseId: "a".repeat(15) }],
    ["a popup lease longer than 128 characters", { popupLeaseId: "a".repeat(129) }],
  ])("refuses %s", async (_label, overrides) => {
    await expect(startSession(payload(overrides), popupSender)).resolves.toEqual({
      ok: false,
      error: "Malformed session request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an api key of exactly the maximum length", async () => {
    const started = await startSession(payload({ apiKey: "k".repeat(512) }), popupSender);

    expect(started.ok).toBe(true);
  });

  it("accepts a popup lease of exactly the minimum length", async () => {
    const started = await startSession(payload({ popupLeaseId: "a".repeat(16) }), popupSender);

    expect(started.ok).toBe(true);
  });

  it("accepts a popup lease of exactly the maximum length", async () => {
    const started = await startSession(payload({ popupLeaseId: "a".repeat(128) }), popupSender);

    expect(started.ok).toBe(true);
  });

  it("refuses a session for a popup lease that is no longer registered", async () => {
    await expect(startSession(payload(), popupSender, () => false)).resolves.toEqual({
      ok: false,
      error: "Malformed session request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an insecure origin", async () => {
    await expect(
      startSession(payload({ origin: "http://app.example.com" }), popupSender),
    ).resolves.toEqual({
      ok: false,
      error: "The editor can only be enabled on secure (https) pages",
    });
  });

  it("refuses a session for a tab that is showing another origin", async () => {
    harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page changed. Close and reopen the popup.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a session when the tab navigated while the key was validating", async () => {
    fetchMock.mockImplementation(async () => {
      await bumpNavGen(TAB);
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page navigated while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("refuses a session when the tab changed origin while the key was validating", async () => {
    fetchMock.mockImplementation(async () => {
      harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page navigated while validating. Try again.",
    });
  });

  it("refuses a session when a credential purge invalidated the validation", async () => {
    fetchMock.mockImplementation(async () => {
      await bumpAuthorityEpoch();
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page or popup changed while validating. Try again.",
    });
  });

  it("refuses a session when the tab navigates after the post-validation check", async () => {
    onNthTabRead(2, async () => {
      await bumpNavGen(TAB);
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page or popup changed while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("refuses a session when the tab changes origin after the post-validation check", async () => {
    onNthTabRead(2, async () => {
      harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page or popup changed while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("removes the session when the popup closes while it is being persisted", async () => {
    let leaseChecks = 0;
    const isPopupLeaseActive = () => {
      leaseChecks += 1;
      return leaseChecks <= 2;
    };

    await expect(startSession(payload(), popupSender, isPopupLeaseActive)).resolves.toEqual({
      ok: false,
      error: "The popup closed while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("stores the validated credential for the origin", async () => {
    await openPendingSession();

    await expect(getAllCredentials()).resolves.toEqual({
      [ORIGIN]: { apiKey: API_KEY, validated: true },
    });
  });

  it("opens a pending session with no context-collection authority", async () => {
    await openPendingSession();

    await expect(getSession(TAB)).resolves.toMatchObject({
      status: "pending",
      origin: ORIGIN,
      collectContext: false,
    });
  });
});

/** Interleave a change into the exact gap between two of startSession's tab reads. */
function onNthTabRead(call: number, effect: () => Promise<void>): void {
  const original = harness.chrome.tabs.get.getMockImplementation() as (
    tabId: number,
  ) => Promise<chrome.tabs.Tab>;
  let reads = 0;
  harness.chrome.tabs.get.mockImplementation(async (tabId: number) => {
    reads += 1;
    const tab = await original(tabId);
    if (reads === call) await effect();
    return tab;
  });
}

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

    await expect(revokeSessionFromSender(TAB, pageSender({ frameId: 2 }))).resolves.toBe(false);
    await expect(getSession(TAB)).resolves.toMatchObject({ status: "active" });
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
