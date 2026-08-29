/**
 * Minimal chrome.* fake for exercising the service worker's real message
 * routing and session orchestration in vitest. Installed as globalThis.chrome
 * BEFORE the service-worker module is imported, so its listener registration
 * lands in this fake.
 */
import { vi } from "vitest";
import { clearTabLimits } from "../proxy-handler";

type Listener = (...args: unknown[]) => unknown;

/** Enough rounds for the longest fire-and-forget chain: badge render → storage read → setIcon. */
const FLUSH_ROUNDS = 5;

class FakeStorageArea {
  private data = new Map<string, unknown>();

  get = async (keys: string | string[] | null): Promise<Record<string, unknown>> => {
    if (keys === null) return Object.fromEntries(this.data);
    const list = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const key of list) {
      if (this.data.has(key)) result[key] = this.data.get(key);
    }
    return result;
  };

  set = async (items: Record<string, unknown>): Promise<void> => {
    for (const [key, value] of Object.entries(items)) this.data.set(key, value);
  };

  remove = async (keys: string | string[]): Promise<void> => {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.data.delete(key);
  };

  clear() {
    this.data.clear();
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }
}

export interface FakeChrome {
  storage: { session: FakeStorageArea; local: FakeStorageArea };
  runtime: {
    onMessage: { addListener: (fn: Listener) => void };
    onConnect: { addListener: (fn: Listener) => void };
    onInstalled: { addListener: (fn: Listener) => void };
    sendMessage: ReturnType<typeof vi.fn>;
    lastError: undefined;
  };
  tabs: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    onRemoved: { addListener: (fn: Listener) => void };
    onUpdated: { addListener: (fn: Listener) => void };
  };
  action: {
    setIcon: ReturnType<typeof vi.fn>;
    setBadgeText: ReturnType<typeof vi.fn>;
    setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
    setBadgeTextColor: ReturnType<typeof vi.fn>;
  };
}

export interface Harness {
  chrome: FakeChrome;
  /** Configure what chrome.tabs.get reports for a tab. */
  setTabUrl(tabId: number, url: string | undefined): void;
  /** Deliver a runtime message exactly like Chrome would; resolves with sendResponse's value. */
  dispatchMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown>;
  fireTabRemoved(tabId: number): void;
  fireDocumentReady(tabId: number, documentId?: string): Promise<unknown>;
  fireTabUpdated(tabId: number, changeInfo: { status?: string; url?: string }): void;
  fireInstalled(reason: "install" | "update"): void;
  openPopupLease(leaseId: string): { disconnect(): void };
  /** Wait for handlers that respond synchronously but do async follow-up work. */
  flush(): Promise<void>;
  /** Re-stub `chrome`, clear storage and mock history, and clear the proxy rate limits of `tabIds`. */
  reset(...tabIds: number[]): void;
}

export function installFakeChrome(): Harness {
  const messageListeners: Listener[] = [];
  const removedListeners: Listener[] = [];
  const updatedListeners: Listener[] = [];
  const connectListeners: Listener[] = [];
  const installedListeners: Listener[] = [];
  const tabUrls = new Map<number, string | undefined>();

  const fake: FakeChrome = {
    storage: { session: new FakeStorageArea(), local: new FakeStorageArea() },
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onConnect: { addListener: (fn) => connectListeners.push(fn) },
      onInstalled: { addListener: (fn) => installedListeners.push(fn) },
      sendMessage: vi.fn((_message: unknown, callback?: () => void) => callback?.()),
      lastError: undefined,
    },
    tabs: {
      get: vi.fn(async (tabId: number) => {
        if (!tabUrls.has(tabId)) throw new Error(`No tab with id ${tabId}`);
        return { id: tabId, url: tabUrls.get(tabId) };
      }),
      query: vi.fn(async () =>
        [...tabUrls.entries()].map(([id, url]) => ({ id, url }) as chrome.tabs.Tab),
      ),
      sendMessage: vi.fn((_tabId: number, _message: unknown, callback?: () => void) =>
        callback?.(),
      ),
      onRemoved: { addListener: (fn) => removedListeners.push(fn) },
      onUpdated: { addListener: (fn) => updatedListeners.push(fn) },
    },
    action: {
      setIcon: vi.fn(async () => undefined),
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setBadgeTextColor: vi.fn(async () => undefined),
    },
  };

  vi.stubGlobal("chrome", fake);

  function dispatchMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ): Promise<unknown> {
    return new Promise((resolve) => {
      let responded = false;
      let keptOpen = false;
      for (const listener of messageListeners) {
        const result = listener(message, sender, (response: unknown) => {
          responded = true;
          resolve(response);
        });
        if (result === true) keptOpen = true;
      }
      if (!keptOpen && !responded) {
        void Promise.resolve().then(() => resolve(undefined));
      }
    });
  }

  return {
    chrome: fake,
    setTabUrl(tabId, url) {
      tabUrls.set(tabId, url);
    },
    dispatchMessage,
    fireTabRemoved(tabId) {
      for (const listener of removedListeners) listener(tabId);
    },
    fireDocumentReady(tabId, documentId = "next-document") {
      const url = tabUrls.get(tabId);
      return dispatchMessage(
        { type: "DOCUMENT_READY" },
        {
          tab: { id: tabId, url } as chrome.tabs.Tab,
          frameId: 0,
          documentId,
          origin: url ? new URL(url).origin : undefined,
        },
      );
    },
    fireTabUpdated(tabId, changeInfo) {
      for (const listener of updatedListeners) listener(tabId, changeInfo);
    },
    fireInstalled(reason) {
      for (const listener of installedListeners) listener({ reason });
    },
    openPopupLease(leaseId) {
      const portMessageListeners: Listener[] = [];
      const disconnectListeners: Listener[] = [];
      const port = {
        name: "comvi-popup-lifecycle",
        sender: {},
        onMessage: { addListener: (fn: Listener) => portMessageListeners.push(fn) },
        onDisconnect: { addListener: (fn: Listener) => disconnectListeners.push(fn) },
        postMessage: vi.fn(),
      } as unknown as chrome.runtime.Port;
      for (const listener of connectListeners) listener(port);
      for (const listener of portMessageListeners) {
        listener({ type: "REGISTER_POPUP", leaseId });
      }
      return {
        disconnect() {
          for (const listener of disconnectListeners) listener();
        },
      };
    },
    async flush() {
      // Drain a few macrotask/microtask rounds for fire-and-forget handlers.
      for (let i = 0; i < FLUSH_ROUNDS; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    reset(...tabIds: number[]) {
      // `unstubGlobals` tears the fake down after every test, but the service
      // worker was imported once and holds listeners in THIS object.
      vi.stubGlobal("chrome", fake);
      fake.storage.session.clear();
      fake.storage.local.clear();
      fake.action.setIcon.mockClear();
      fake.action.setBadgeText.mockClear();
      fake.runtime.sendMessage.mockClear();
      fake.tabs.sendMessage.mockClear();
      tabUrls.clear();
      // proxy-work keeps a module-level per-tab request log with a 60s window;
      // without this the suite's own requests accumulate against the rate cap.
      for (const tabId of tabIds) clearTabLimits(tabId);
    },
  };
}
