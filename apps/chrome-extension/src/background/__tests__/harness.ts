/**
 * Minimal chrome.* fake for exercising the service worker's real message
 * routing and session orchestration in vitest. Installed as globalThis.chrome
 * BEFORE the service-worker module is imported, so its listener registration
 * lands in this fake.
 */
import { vi } from "vitest";

type Listener = (...args: unknown[]) => unknown;

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
    lastError: undefined;
  };
  tabs: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
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
  fireTabLoading(tabId: number): void;
  fireInstalled(reason: "install" | "update"): void;
  openPopupLease(leaseId: string): { disconnect(): void };
  /** Wait for handlers that respond synchronously but do async follow-up work. */
  flush(): Promise<void>;
  reset(): void;
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
      onRemoved: { addListener: (fn) => removedListeners.push(fn) },
      onUpdated: { addListener: (fn) => updatedListeners.push(fn) },
    },
    action: {
      setIcon: vi.fn(),
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setBadgeTextColor: vi.fn(),
    },
  };

  vi.stubGlobal("chrome", fake);

  return {
    chrome: fake,
    setTabUrl(tabId, url) {
      tabUrls.set(tabId, url);
    },
    dispatchMessage(message, sender) {
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
        // Mirror Chrome: if no listener keeps the channel open and nobody
        // responded synchronously, the response is undefined.
        if (!keptOpen && !responded) {
          // Give synchronous-but-void handlers a microtask to settle.
          void Promise.resolve().then(() => resolve(undefined));
        }
      });
    },
    fireTabRemoved(tabId) {
      for (const listener of removedListeners) listener(tabId);
    },
    fireTabLoading(tabId) {
      for (const listener of updatedListeners) listener(tabId, { status: "loading" });
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
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    reset() {
      fake.storage.session.clear();
      fake.storage.local.clear();
      fake.action.setIcon.mockClear();
      fake.action.setBadgeText.mockClear();
      tabUrls.clear();
    },
  };
}
