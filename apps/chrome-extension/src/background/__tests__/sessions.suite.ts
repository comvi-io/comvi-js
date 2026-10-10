/**
 * Shared setup for the session state-machine suites: a fresh chrome fake per test,
 * the validation network mock, and the helpers the feature files use.
 * Importing this module registers the hooks for the importing test file.
 */
import { afterEach, beforeEach, vi } from "vitest";
import { installFakeChrome, type Harness } from "./harness";
import { confirmActivation, startSession } from "../sessions";
import { tabLockKey, withLock, type SessionRecord } from "../state";

export const TAB = 5;
export const OTHER_TAB = 6;
export const ORIGIN = "https://app.example.com";
export const PAGE_URL = `${ORIGIN}/dashboard`;
export const OTHER_ORIGIN = "https://other.example.com";
export const API_KEY = "cmv_test_key_123";
export const LEASE = "popup-lease-test-0001";
export const API = "https://api.comvi.io";

/** A popup sender: extension pages have no `tab`. */
export const popupSender = {} as chrome.runtime.MessageSender;

export function pageSender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    tab: { id: TAB } as chrome.tabs.Tab,
    frameId: 0,
    origin: ORIGIN,
    documentId: "doc-1",
    ...overrides,
  } as chrome.runtime.MessageSender;
}

export let harness: Harness;
export let fetchMock: ReturnType<typeof vi.fn>;

/** Validate every key successfully unless a test says otherwise. */
export function apiValidates(projectId: unknown = 42) {
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

export function payload(overrides: Record<string, unknown> = {}) {
  return { tabId: TAB, origin: ORIGIN, apiKey: API_KEY, popupLeaseId: LEASE, ...overrides };
}

export async function openPendingSession(): Promise<string> {
  const started = await startSession(payload(), popupSender);
  if (!started.ok || !started.nonce) throw new Error(`session not opened: ${started.error}`);
  return started.nonce;
}

export async function openActiveSession(): Promise<string> {
  const nonce = await openPendingSession();
  const promoted = await confirmActivation(TAB, pageSender(), nonce, true, () => true);
  if (!promoted) throw new Error("session not promoted");
  return nonce;
}

export function storedSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
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
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Occupy the tab's mutation lock so a caller queues behind it, leaving a window
 * in which the stored record can change after it was enumerated.
 */
export function holdTabLock() {
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
export function lastIconPath(): string {
  const calls = harness.chrome.action.setIcon.mock.calls;
  const [last] = calls[calls.length - 1] as [{ path: Record<number, string> }];
  return last.path[16];
}

/** Interleave a change into the exact gap between two of startSession's tab reads. */
export function onNthTabRead(call: number, effect: () => Promise<void>): void {
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
