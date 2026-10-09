/**
 * Shared setup for the service-worker integration suites: the chrome fake,
 * the worker import, per-test reset, and the helpers the feature files use.
 * Importing this module registers the hooks for the importing test file.
 */
import { expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { installFakeChrome, type FakePort, type Harness } from "./harness";

export const TAB = 7;
/** Every tab id the suite proxies through; their rate-limit logs are reset per test. */
export const ALL_TABS = [TAB, TAB + 1, 11, 12, 13];
export const ORIGIN = "https://app.example.com";
export const PAGE_URL = `${ORIGIN}/dashboard`;
export const API_KEY = "cmv_test_key_123";
export const POPUP_LEASE = "popup-lease-test-0001";
/** `vi.waitFor` defaults to a 50 ms retry interval; every wait here settles within a tick. */
export const POLL = { interval: 1 };

export let harness: Harness;
export let popupLease: FakePort;
export let initializeServiceWorkerState: (clearSessions?: boolean) => Promise<void>;

// Deterministic network: /v1/project validates the key, everything else 200s.
export const fetchMock = vi.fn();

export function mockApiOk(projectId: number | string = 42) {
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
  ({ initializeServiceWorkerState } = await import("../service-worker"));
});

beforeEach(async () => {
  harness.reset(...ALL_TABS);
  vi.stubGlobal("fetch", fetchMock);
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

export const popupSender: chrome.runtime.MessageSender = {} as chrome.runtime.MessageSender;

export function pageSender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    tab: { id: TAB } as chrome.tabs.Tab,
    frameId: 0,
    origin: ORIGIN,
    documentId: "doc-1",
    ...overrides,
  } as chrome.runtime.MessageSender;
}

export async function startSession(overrides: Record<string, unknown> = {}) {
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

export async function activate(
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

export async function proxyRequest(
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

export async function openActiveSession(): Promise<string> {
  const started = await startSession();
  expect(started.ok).toBe(true);
  await activate(started.nonce);
  return started.nonce!;
}

// --- session lifecycle ---

// --- sender enforcement ---

// --- origin canonicalization ---

// --- proxy authorization + telemetry ---

// --- credential revocation ---

// --- badge trust ---

// --- storage concurrency ---

// --- message routing details ---

/** Every SESSION_STATE_CHANGED payload the worker has broadcast so far. */
export function broadcasts(): Record<string, unknown>[] {
  return harness.chrome.runtime.sendMessage.mock.calls
    .map(([message]) => message as { type?: string; payload?: Record<string, unknown> })
    .filter((message) => message.type === "SESSION_STATE_CHANGED")
    .map((message) => message.payload ?? {});
}

/** Tab ids the worker told to tear the editor down. */
export function deactivatedTabs(): number[] {
  return harness.chrome.tabs.sendMessage.mock.calls
    .filter(([, message]) => (message as { type?: string }).type === "DEACTIVATE_EDITOR")
    .map(([tabId]) => tabId as number);
}

export function lastBadgeText(): string | undefined {
  const calls = harness.chrome.action.setBadgeText.mock.calls;
  return (calls[calls.length - 1]?.[0] as { text?: string } | undefined)?.text;
}

export function lastIconPath(): string | undefined {
  const calls = harness.chrome.action.setIcon.mock.calls;
  return (calls[calls.length - 1]?.[0] as { path?: Record<number, string> } | undefined)
    ?.path?.[16];
}

export async function sessionStatus(tabId = TAB) {
  return (await harness.dispatchMessage(
    { type: "GET_SESSION_STATUS", payload: { tabId } },
    popupSender,
  )) as { active: boolean; pending: boolean; comviDetected?: boolean; version?: string };
}

export const NO_RESPONSE = Symbol("no response");

/**
 * Start a message exchange and report its response, or NO_RESPONSE if the
 * channel is never answered. Fake timers are installed before `start` runs,
 * so no timer it creates can depend on the wall clock; everything due now
 * then runs to completion. A rejected exchange rejects here too.
 */
export async function responseWithin(start: () => Promise<unknown>): Promise<unknown> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  try {
    let outcome: { answered: true; value: unknown } | { failed: true; error: unknown } | undefined;
    start().then(
      (value) => {
        outcome = { answered: true, value };
      },
      (error: unknown) => {
        outcome = { failed: true, error };
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    if (outcome && "failed" in outcome) throw outcome.error;
    return outcome ? outcome.value : NO_RESPONSE;
  } finally {
    vi.useRealTimers();
  }
}

/**
 * Evaluate a brand-new copy of the worker modules against a new chrome fake,
 * as MV3 does after terminating an idle worker: no popup leases, locks,
 * timers or listeners survive, only what `retained` copies into storage.
 */
export async function startFreshWorker(
  retained?: Harness,
  prepare?: (fresh: Harness) => void,
): Promise<Harness> {
  vi.resetModules();
  const fresh = installFakeChrome();
  if (retained) {
    await fresh.chrome.storage.session.set(retained.chrome.storage.session.snapshot());
    await fresh.chrome.storage.local.set(retained.chrome.storage.local.snapshot());
  }
  fresh.setTabUrl(TAB, PAGE_URL);
  prepare?.(fresh);
  await import("../service-worker");
  await fresh.flush();
  return fresh;
}
