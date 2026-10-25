/**
 * Service worker integration: Forget key revokes the credential and every session that used it.
 */
import { describe, it, expect } from "vitest";
import {
  TAB,
  ORIGIN,
  PAGE_URL,
  API_KEY,
  harness,
  fetchMock,
  popupSender,
  pageSender,
  startSession,
  activate,
  proxyRequest,
  openActiveSession,
  broadcasts,
  deactivatedTabs,
} from "./service-worker.suite";

describe("FORGET_CREDENTIALS", () => {
  it("clears the saved credential for the origin", async () => {
    await openActiveSession();

    const result = await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    );

    expect(result).toMatchObject({ ok: true });
    const credentials = harness.chrome.storage.local.snapshot()["comvi_credentials"] as
      Record<string, unknown> | undefined;
    expect(credentials?.[ORIGIN]).toBeUndefined();
  });

  it("revokes the origin's session so the proxy refuses afterwards", async () => {
    await openActiveSession();
    await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    );

    const result = await proxyRequest();

    expect(result.networkError).toMatch(/No active editor session/);
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
      Record<string, { apiKey?: string }> | undefined;
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

describe("FORGET_CREDENTIALS routing", () => {
  it("publishes and tears down every revoked tab", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    const response = await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: ORIGIN } },
      popupSender,
    );

    expect(response).toEqual({ ok: true, error: undefined });
    expect(broadcasts()).toEqual([{ tabId: TAB, active: false, pending: false }]);
    expect(deactivatedTabs()).toEqual([TAB]);
  });

  it("publishes nothing when the origin is rejected", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    const response = await harness.dispatchMessage(
      { type: "FORGET_CREDENTIALS", payload: { origin: "not-an-origin" } },
      popupSender,
    );

    expect(response).toEqual({ ok: false, error: "Invalid origin" });
    expect(broadcasts()).toEqual([]);
    expect(deactivatedTabs()).toEqual([]);
  });
});
