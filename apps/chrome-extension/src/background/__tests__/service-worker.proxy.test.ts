/**
 * Service worker integration: the authenticated proxy, its route contract, cancellation and response-channel discipline.
 */
import { describe, it, expect, vi } from "vitest";
import { tabLockKey, withLock } from "../state";
import {
  TAB,
  ORIGIN,
  POLL,
  harness,
  fetchMock,
  popupSender,
  pageSender,
  startSession,
  activate,
  proxyRequest,
  openActiveSession,
} from "./service-worker.suite";

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

  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "answers an inherited query name %s with a failure and no network access",
    async (name) => {
      await openActiveSession();
      const before = fetchMock.mock.calls.length;
      const result = await proxyRequest({
        path: `/v1/translations?${encodeURIComponent(name)}=x`,
      });
      expect(result).toMatchObject({
        ok: false,
        networkError: `Unexpected query parameter: ${name}`,
      });
      expect(fetchMock.mock.calls.length).toBe(before);
    },
  );

  it("telemetry routes stay closed when activation does not enable collection", async () => {
    await openActiveSession();
    const result = await proxyRequest({
      path: "/v1/context/handshake",
      method: "POST",
      body: JSON.stringify({ keys: [] }),
    });
    expect(result.networkError).toMatch(/telemetry is disabled/);
  });

  // The flag is page-reported (MAIN world), so this is an honest-site opt-out,
  // not a boundary: a hostile page can report true (see Gate E
  // hostile-activation.spec.ts).
  it("telemetry routes open when the page-reported activation result enables collection", async () => {
    const started = await startSession();
    await activate(started.nonce, pageSender(), { collectContext: true });
    const result = await proxyRequest({
      path: "/v1/context/usages",
      method: "POST",
      body: JSON.stringify({ origin: ORIGIN, hashFnVersion: 1, items: [], stillValid: [] }),
    });
    expect(result.ok).toBe(true);
  });

  it("a page-reported false keeps telemetry closed", async () => {
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
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"), POLL);

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
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"), POLL);

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
    await vi.waitFor(() => expect(releaseLock).toBeTypeOf("function"), POLL);

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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(before + 1), POLL);
    const ended = harness.dispatchMessage(
      { type: "END_SESSION", payload: { tabId: TAB } },
      popupSender,
    );

    await expect(ended).resolves.toMatchObject({ ok: true });
    await expect(pendingProxy).resolves.toMatchObject({ networkError: "Request aborted" });
    expect(observedAbort).toBe(true);
  });
});

describe("in-flight proxy cancellation", () => {
  /** A fetch that only settles when its caller aborts it. */
  function stallingFetch() {
    const started = { value: false };
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          started.value = true;
          init.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );
    return started;
  }

  it("cancels a proxied request on the page's request", async () => {
    await openActiveSession();
    const started = stallingFetch();

    const inFlight = proxyRequest({ id: "cancel-me" });
    await vi.waitFor(() => expect(started.value).toBe(true), POLL);
    await harness.dispatchMessage(
      { type: "API_PROXY_ABORT", payload: { id: "cancel-me" } },
      pageSender(),
    );

    await expect(inFlight).resolves.toMatchObject({ networkError: "Request aborted" });
  });

  it("cancels in-flight work when the tab is closed", async () => {
    await openActiveSession();
    const started = stallingFetch();

    const inFlight = proxyRequest({ id: "closing-tab" });
    await vi.waitFor(() => expect(started.value).toBe(true), POLL);
    harness.fireTabRemoved(TAB);

    await expect(inFlight).resolves.toMatchObject({ networkError: "Request aborted" });
  });
});

describe("message channel discipline", () => {
  // Answering synchronously and still returning true leaves Chrome holding the
  // response port open for a reply that will never come.
  it.each([
    [
      "DOCUMENT_READY from a subframe",
      { type: "DOCUMENT_READY" },
      () => pageSender({ frameId: 4 }),
    ],
    [
      "ROLLBACK_ACTIVATION without a tab id",
      { type: "ROLLBACK_ACTIVATION", payload: { nonce: "n" } },
      () => popupSender,
    ],
    ["END_SESSION without a payload", { type: "END_SESSION" }, () => popupSender],
  ])("closes the response channel after refusing %s", async (_label, message, makeSender) => {
    const { response, keptOpen } = await harness.dispatchMessageWithChannel(message, makeSender());

    expect(response).toEqual({ ok: false });
    expect(keptOpen).toBe(false);
  });
});
