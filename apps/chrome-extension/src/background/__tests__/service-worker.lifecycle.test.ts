/**
 * Service worker integration: extension updates, installs and MV3 worker restarts.
 */
import { describe, it, expect, vi } from "vitest";
import { CURRENT_STORAGE_SCHEMA_VERSION, STORAGE_SCHEMA_KEY } from "../../shared/storage";
import {
  TAB,
  ORIGIN,
  PAGE_URL,
  API_KEY,
  POPUP_LEASE,
  harness,
  fetchMock,
  popupSender,
  pageSender,
  startSession,
  openActiveSession,
  broadcasts,
  deactivatedTabs,
  sessionStatus,
  startFreshWorker,
} from "./service-worker.suite";

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

describe("worker restart", () => {
  it("recovers an active session in a fresh worker and keeps proxying for its document", async () => {
    await openActiveSession();

    const fresh = await startFreshWorker(harness);
    const status = await fresh.dispatchMessage(
      { type: "GET_SESSION_STATUS", payload: { tabId: TAB } },
      popupSender,
    );
    const proxied = await fresh.dispatchMessage(
      { type: "API_PROXY_REQUEST", payload: { id: "after-restart", path: "/v1/project/locales" } },
      pageSender(),
    );

    expect(status).toMatchObject({ active: true, pending: false });
    expect(proxied).toMatchObject({ id: "after-restart", ok: true, status: 200 });
  });

  it("fails a pending session closed when its popup lease did not survive the restart", async () => {
    const started = await startSession();

    const fresh = await startFreshWorker(harness);
    await fresh.dispatchMessage(
      { type: "EDITOR_ACTIVATED", payload: { success: true, nonce: started.nonce } },
      pageSender(),
    );
    await fresh.flush();
    const proxied = await fresh.dispatchMessage(
      { type: "API_PROXY_REQUEST", payload: { id: "pending", path: "/v1/project/locales" } },
      pageSender(),
    );

    expect(fresh.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
    expect(proxied).toMatchObject({
      ok: false,
      networkError: "No active editor session for this tab",
    });
  });

  it("sweeps a pending session whose deadline passed while the worker was stopped", async () => {
    await startSession();
    const record = harness.chrome.storage.session.snapshot()[`comvi_session_${TAB}`] as {
      expiresAt: number;
    };
    record.expiresAt = Date.now() - 1;

    const fresh = await startFreshWorker(harness);

    expect(fresh.chrome.storage.session.snapshot()).not.toHaveProperty(`comvi_session_${TAB}`);
  });

  it("restricts persisted credentials to trusted contexts before touching them", async () => {
    const calls: string[] = [];
    const fresh = await startFreshWorker(undefined, (worker) => {
      const local = worker.chrome.storage.local as unknown as Record<string, unknown>;
      local.setAccessLevel = vi.fn(async (options: { accessLevel: string }) => {
        calls.push(`setAccessLevel:${options.accessLevel}`);
      });
      const get = worker.chrome.storage.local.get;
      const set = worker.chrome.storage.local.set;
      worker.chrome.storage.local.get = async (keys) => {
        calls.push("get");
        return get(keys);
      };
      worker.chrome.storage.local.set = async (items) => {
        calls.push("set");
        return set(items);
      };
    });
    fresh.openPopupLease(POPUP_LEASE);

    const started = await fresh.dispatchMessage(
      {
        type: "START_SESSION",
        payload: { tabId: TAB, origin: ORIGIN, apiKey: API_KEY, popupLeaseId: POPUP_LEASE },
      },
      popupSender,
    );

    expect(started).toMatchObject({ ok: true });
    expect(calls[0]).toBe("setAccessLevel:TRUSTED_CONTEXTS");
    expect(calls.slice(1)).toContain("set");
  });

  // The README promises content scripts cannot read saved keys, so the worker
  // handles no credential until the restriction is in place.
  it.each([
    [
      "has no storage access-level API",
      (local: Record<string, unknown>) => {
        delete local.setAccessLevel;
      },
    ],
    [
      "refuses to restrict local storage",
      (local: Record<string, unknown>) => {
        local.setAccessLevel = vi.fn(async () => {
          throw new Error("This StorageArea is not available for setting access level");
        });
      },
    ],
  ])("handles no credential when the browser %s", async (_label, breakRestriction) => {
    const fresh = await startFreshWorker(harness, (worker) =>
      breakRestriction(worker.chrome.storage.local as unknown as Record<string, unknown>),
    );
    fresh.openPopupLease(POPUP_LEASE);
    const before = fetchMock.mock.calls.length;

    const started = await fresh.dispatchMessage(
      {
        type: "START_SESSION",
        payload: { tabId: TAB, origin: ORIGIN, apiKey: API_KEY, popupLeaseId: POPUP_LEASE },
      },
      popupSender,
    );
    const status = await fresh.dispatchMessage(
      { type: "GET_SESSION_STATUS", payload: { tabId: TAB } },
      popupSender,
    );

    expect(started).toMatchObject({ ok: false });
    expect(status).toMatchObject({
      active: false,
      pending: false,
      unavailable: expect.any(String),
    });
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(fresh.chrome.storage.local.snapshot()).not.toHaveProperty("comvi_credentials");
  });

  it("handles credentials once a retried restriction succeeds", async () => {
    let refuse = true;
    const fresh = await startFreshWorker(harness, (worker) => {
      (worker.chrome.storage.local as unknown as Record<string, unknown>).setAccessLevel = vi.fn(
        async () => {
          if (refuse) throw new Error("transient");
        },
      );
    });
    fresh.openPopupLease(POPUP_LEASE);
    refuse = false;

    const started = await fresh.dispatchMessage(
      {
        type: "START_SESSION",
        payload: { tabId: TAB, origin: ORIGIN, apiKey: API_KEY, popupLeaseId: POPUP_LEASE },
      },
      popupSender,
    );

    expect(started).toMatchObject({ ok: true });
  });
});

describe("extension lifecycle", () => {
  it("publishes the cleared state for every tab an update revoked", async () => {
    await openActiveSession();
    harness.chrome.runtime.sendMessage.mockClear();
    harness.chrome.tabs.sendMessage.mockClear();

    harness.fireInstalled("update");
    await harness.flush();

    expect(broadcasts()).toEqual([{ tabId: TAB, active: false, pending: false }]);
    expect(deactivatedTabs()).toEqual([TAB]);
  });

  it("keeps sessions across a fresh install", async () => {
    await openActiveSession();

    harness.fireInstalled("install");
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ active: true });
  });

  it("leaves badges alone for tabs that report no id", async () => {
    harness.chrome.tabs.query.mockResolvedValueOnce([{ url: PAGE_URL } as chrome.tabs.Tab]);
    harness.chrome.action.setIcon.mockClear();

    harness.fireInstalled("update");
    await harness.flush();

    expect(harness.chrome.action.setIcon).not.toHaveBeenCalled();
  });
});
