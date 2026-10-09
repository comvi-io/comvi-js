/**
 * Service worker integration: document readiness, SPA routes and top-level navigation decide when authority ends.
 */
import { describe, it, expect, vi } from "vitest";
import { DOCUMENT_PING_TIMEOUT_MS } from "../sessions";
import {
  TAB,
  ORIGIN,
  harness,
  popupSender,
  pageSender,
  startSession,
  proxyRequest,
  openActiveSession,
  broadcasts,
  lastBadgeText,
  sessionStatus,
} from "./service-worker.suite";

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

// Chrome reports status "loading"/"complete" for History API routes as well
// as for real navigations, so the status alone cannot revoke. The worker asks
// the session's bound document whether it still exists.
describe("top-level navigation without a replacement bridge", () => {
  function pingedDocuments(): unknown[] {
    return harness.chrome.tabs.sendMessage.mock.calls
      .filter(([, message]) => (message as { type?: string }).type === "PING_DOCUMENT")
      .map(([, , options]) => (options as { documentId?: string }).documentId);
  }

  it("keeps the session through History API status changes while its document answers", async () => {
    await openActiveSession();

    harness.setTabUrl(TAB, `${ORIGIN}/spa-route`);
    harness.fireTabUpdated(TAB, { status: "loading", url: `${ORIGIN}/spa-route` });
    harness.fireTabUpdated(TAB, { status: "complete" });
    await harness.flush();

    expect(pingedDocuments()).toEqual(["doc-1", "doc-1"]);
    expect(await sessionStatus()).toMatchObject({ active: true, pending: false });
    await expect(proxyRequest()).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("revokes the session and resets the toolbar when its document is gone", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.action.setIcon.mockClear();

    // e.g. chrome://settings: no content script runs, so no DOCUMENT_READY.
    harness.markDocumentGone("doc-1");
    harness.setTabUrl(TAB, undefined);
    harness.fireTabUpdated(TAB, { status: "loading" });
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ active: false, pending: false });
    expect(lastBadgeText()).toBe("");
    const icons = harness.chrome.action.setIcon.mock.calls;
    expect((icons[icons.length - 1]?.[0] as { path: Record<number, string> }).path[16]).toContain(
      "icon-inactive-16",
    );
    expect(broadcasts()).toContainEqual({
      tabId: TAB,
      active: false,
      pending: false,
      comviDetected: false,
    });
    await expect(proxyRequest()).resolves.toMatchObject({ ok: false });
  });

  it("does not delete a replacement session bound to a newer document", async () => {
    await openActiveSession();
    let answerPing!: () => void;
    harness.respondToDocumentPing(
      () =>
        new Promise((_resolve, reject) => {
          answerPing = () => reject(new Error("Receiving end does not exist."));
        }),
    );

    harness.fireTabUpdated(TAB, { status: "complete" });
    await harness.flush();
    const replacement = {
      ...(harness.chrome.storage.session.snapshot()[`comvi_session_${TAB}`] as object),
      documentId: "doc-2",
      nonce: "nonce-2",
    };
    await harness.chrome.storage.session.set({ [`comvi_session_${TAB}`]: replacement });
    answerPing();
    await harness.flush();

    expect(harness.chrome.storage.session.snapshot()[`comvi_session_${TAB}`]).toEqual(replacement);
  });

  it("revokes without messaging when the tab's top-level origin changed", async () => {
    await openActiveSession();

    harness.setTabUrl(TAB, "https://elsewhere.example/");
    harness.fireTabUpdated(TAB, { status: "complete" });
    await harness.flush();

    expect(pingedDocuments()).toEqual([]);
    expect(await sessionStatus()).toMatchObject({ active: false, pending: false });
  });

  // Observed in Chromium: a message to a document that is entering the
  // back/forward cache is neither answered nor failed.
  it("treats a document that never answers as gone", async () => {
    await openActiveSession();
    harness.respondToDocumentPing(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    harness.fireTabUpdated(TAB, { status: "complete" });
    await vi.advanceTimersByTimeAsync(DOCUMENT_PING_TIMEOUT_MS + 1);
    vi.useRealTimers();
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ active: false, pending: false });
  });

  it("keeps the session when the document answers just within the deadline", async () => {
    await openActiveSession();
    harness.respondToDocumentPing(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ alive: true }), DOCUMENT_PING_TIMEOUT_MS - 50),
        ),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    harness.fireTabUpdated(TAB, { status: "complete" });
    await vi.advanceTimersByTimeAsync(DOCUMENT_PING_TIMEOUT_MS + 1);
    vi.useRealTimers();
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ active: true, pending: false });
  });

  it("does not message any document when the tab has no active session", async () => {
    await startSession(); // pending only: no document is bound yet

    harness.fireTabUpdated(TAB, { status: "loading" });
    await harness.flush();

    expect(pingedDocuments()).toEqual([]);
  });

  it("ignores updates that carry no status", async () => {
    await openActiveSession();

    harness.fireTabUpdated(TAB, { url: `${ORIGIN}/another-route` });
    await harness.flush();

    expect(pingedDocuments()).toEqual([]);
  });

  it("revokes an active session when its own document is restored from the back/forward cache", async () => {
    await openActiveSession();

    const response = await harness.dispatchMessage(
      { type: "DOCUMENT_READY", payload: { restored: true } },
      pageSender(),
    );

    expect(response).toEqual({ ok: true });
    expect(await sessionStatus()).toMatchObject({ active: false, pending: false });
  });
});

describe("DOCUMENT_READY", () => {
  it("answers a new document with a cleared tab state", async () => {
    harness.chrome.runtime.sendMessage.mockClear();

    const response = await harness.fireDocumentReady(TAB, "doc-2");

    expect(response).toEqual({ ok: true });
    expect(broadcasts()).toEqual([
      { tabId: TAB, active: false, pending: false, comviDetected: false },
    ]);
    expect(await sessionStatus()).toMatchObject({ comviDetected: false });
  });

  it("stays silent for a repeated signal from the same document", async () => {
    harness.chrome.runtime.sendMessage.mockClear();

    const response = await harness.fireDocumentReady(TAB, "doc-1");

    expect(response).toEqual({ ok: true });
    expect(broadcasts()).toEqual([]);
  });

  it("refuses a signal that did not come from a tab", async () => {
    const response = await harness.dispatchMessage({ type: "DOCUMENT_READY" }, {
      frameId: 0,
    } as chrome.runtime.MessageSender);

    expect(response).toEqual({ ok: false });
  });

  it("refuses a signal from a subframe", async () => {
    const response = await harness.dispatchMessage(
      { type: "DOCUMENT_READY" },
      pageSender({ frameId: 4 }),
    );

    expect(response).toEqual({ ok: false });
  });

  it("reports failure when the tab state cannot be written", async () => {
    vi.spyOn(harness.chrome.storage.session, "set").mockRejectedValue(new Error("storage full"));

    const response = await harness.fireDocumentReady(TAB, "doc-3");

    expect(response).toEqual({ ok: false });
  });
});
