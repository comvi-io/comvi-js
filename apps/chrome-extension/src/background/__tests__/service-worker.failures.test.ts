/**
 * Service worker integration: every asynchronous message is answered, including when storage or initialization fails.
 */
import { describe, it, expect, vi } from "vitest";
import {
  TAB,
  ORIGIN,
  harness,
  initializeServiceWorkerState,
  fetchMock,
  popupSender,
  startSession,
  proxyRequest,
  openActiveSession,
  NO_RESPONSE,
  responseWithin,
} from "./service-worker.suite";

describe("storage failures at the response boundary", () => {
  const storageError = new Error("storage unavailable");

  it("reports an answered channel as its response", async () => {
    await expect(responseWithin(Promise.resolve("answered"))).resolves.toBe("answered");
  });

  it("reports a channel that is never answered as no response", async () => {
    await expect(responseWithin(new Promise(() => {}))).resolves.toBe(NO_RESPONSE);
  });

  it("answers START_SESSION and rolls the pending record back when the key cannot be saved", async () => {
    vi.spyOn(harness.chrome.storage.local, "set").mockRejectedValue(storageError);

    const response = await responseWithin(startSession());

    expect(response).toEqual({ ok: false, error: "Could not save the API key. Try again." });
    expect(harness.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
  });

  it("answers END_SESSION with a failure when the session cannot be deleted", async () => {
    await openActiveSession();
    vi.spyOn(harness.chrome.storage.session, "remove").mockRejectedValue(storageError);

    const response = await responseWithin(
      harness.dispatchMessage({ type: "END_SESSION", payload: { tabId: TAB } }, popupSender),
    );

    expect(response).toEqual({ ok: false, error: "storage unavailable" });
  });

  it("answers ROLLBACK_ACTIVATION with a failure when the session cannot be read", async () => {
    const started = await startSession();
    vi.spyOn(harness.chrome.storage.session, "get").mockRejectedValue(storageError);

    const response = await responseWithin(
      harness.dispatchMessage(
        { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB, nonce: started.nonce } },
        popupSender,
      ),
    );

    expect(response).toEqual({ ok: false, error: "storage unavailable" });
  });

  it("answers FORGET_CREDENTIALS with a failure when the credentials cannot be read", async () => {
    await openActiveSession();
    vi.spyOn(harness.chrome.storage.local, "get").mockRejectedValue(storageError);

    const response = await responseWithin(
      harness.dispatchMessage(
        { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
        popupSender,
      ),
    );

    expect(response).toEqual({ ok: false, error: "storage unavailable" });
  });

  it("answers GET_SESSION_STATUS with a failure the popup can tell from inactive", async () => {
    vi.spyOn(harness.chrome.storage.session, "get").mockRejectedValue(storageError);

    const response = await responseWithin(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    );

    expect(response).toEqual({
      active: false,
      pending: false,
      unavailable: "storage unavailable",
    });
  });

  it("answers API_PROXY_REQUEST with a proxy failure when the session cannot be read", async () => {
    await openActiveSession();
    const before = fetchMock.mock.calls.length;
    vi.spyOn(harness.chrome.storage.session, "get").mockRejectedValue(storageError);

    const response = await responseWithin(proxyRequest({ id: "storage-down" }));

    expect(response).toEqual({
      id: "storage-down",
      ok: false,
      status: 0,
      statusText: "",
      body: "",
      networkError: "storage unavailable",
    });
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("retries a failed initialization on the next message", async () => {
    await openActiveSession();
    vi.spyOn(harness.chrome.storage.local, "get").mockRejectedValueOnce(storageError);

    await expect(initializeServiceWorkerState()).rejects.toThrow("storage unavailable");
    const response = await responseWithin(
      harness.dispatchMessage({ type: "GET_SESSION_STATUS", payload: { tabId: TAB } }, popupSender),
    );

    expect(response).toMatchObject({ active: true, pending: false });
  });
});
