/**
 * Popup harness.
 *
 * src/popup/popup.ts is a DOM script: it looks its elements up at module
 * scope, registers a chrome.runtime listener and calls init() on import. So a
 * test stages the REAL popup.html body plus a chrome.* fake first, then
 * imports the module fresh — every scenario gets its own popup instance with
 * its own module state.
 *
 * The harness installs vitest fake timers (the activation deadline is a 15s
 * window.setTimeout); test files restore them with `vi.useRealTimers()`.
 */
import { vi } from "vitest";
import popupHtml from "../popup.html?raw";
import { setCredentials } from "../../shared/storage";
import type { Message, MessageType } from "../../shared/messages";

/** Rounds of microtask/0ms draining; init() fans out into several promise chains. */
const FLUSH_ROUNDS = 6;

const BODY_HTML = (() => {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(popupHtml)?.[1];
  if (body === undefined) throw new Error("popup.html has no <body> to stage");
  // The <script src="popup.js"> tag is the browser's loader for the module the
  // test imports itself; happy-dom would refuse to fetch it.
  return body.replace(/<script[\s\S]*?<\/script>/g, "");
})();

/** A reply that arrives as chrome.runtime.lastError instead of a value. */
export class RuntimeFailure {
  constructor(readonly message: string) {}
}

export function runtimeFailure(message: string): RuntimeFailure {
  return new RuntimeFailure(message);
}

/**
 * What a fake endpoint answers with: a value, a function of the message, or a
 * promise the test resolves later to hold the popup mid-operation. Wrap a
 * `runtimeFailure` to answer through chrome.runtime.lastError instead.
 */
type Reply = unknown | ((message: Message) => unknown);

/**
 * How the fake service worker answers the popup's REGISTER_POPUP:
 * - acknowledge: POPUP_REGISTERED for the lease the popup announced
 * - wrong-lease: POPUP_REGISTERED naming a different popup's lease
 * - other-message: some other message carrying this popup's lease id
 * - disconnect: the port drops instead of answering
 * - silent: no answer at all
 */
export type LeaseBehaviour =
  | "acknowledge"
  | "wrong-lease"
  | "other-message"
  | "disconnect"
  | "silent";

export interface SentTabMessage {
  tabId: number;
  message: Message;
}

interface FakePort {
  name: string;
  postMessage: (message: unknown) => void;
  onMessage: { addListener: (fn: (message: unknown) => void) => void };
  onDisconnect: { addListener: (fn: () => void) => void };
}

export interface PopupHarness {
  /** Resolve chrome.tabs.query to this tab; null resolves to an empty list. */
  setActiveTab(tab: { id?: number; url?: string } | null): void;
  /** Persist a credential for `origin` through the production storage writer. */
  seedCredentials(origin: string, apiKey: string): Promise<void>;
  /** Seed the raw value behind the popup's theme storage key. */
  seedTheme(value: unknown): Promise<void>;
  /** Control what `(prefers-color-scheme: dark)` reports; `null` removes matchMedia. */
  setSystemDark(dark: boolean | null): void;
  /** Reply the fake service worker gives for a chrome.runtime.sendMessage type. */
  onServiceWorker(type: MessageType, reply: Reply): void;
  /** Reply the fake content script gives for a chrome.tabs.sendMessage type. */
  onContentScript(type: MessageType, reply: Reply): void;
  setLeaseBehaviour(behaviour: LeaseBehaviour): void;

  /** Stall every chrome.storage.local.get until `releaseStorageReads`, as a cold disk would. */
  holdStorageReads(): void;
  releaseStorageReads(): Promise<void>;

  /** Import popup.ts fresh against the staged DOM and settle its init fan-out. */
  start(): Promise<void>;
  flush(): Promise<void>;

  serviceWorkerMessages(): Message[];
  contentScriptMessages(): SentTabMessage[];
  executeScript: ReturnType<typeof vi.fn>;
  /** The raw chrome.runtime.sendMessage mock, for faking a torn-down extension context. */
  runtimeSendMessage: ReturnType<typeof vi.fn>;
  storageGet: ReturnType<typeof vi.fn>;
  tabsQuery: ReturnType<typeof vi.fn>;
  leaseConnections(): { name: string }[];
  /** The lease id the popup announced on its lifecycle port, if it opened one. */
  registeredLeaseId(): string | undefined;

  /** Deliver a chrome.runtime message from the service worker (no sender.tab). */
  fromServiceWorker(message: Message): Promise<void>;
  /** Deliver a chrome.runtime message attributed to a content script in `tabId`. */
  fromTab(tabId: number, message: Message): Promise<void>;

  /** Ids of the state panels that are currently NOT hidden. */
  visibleViews(): string[];
  el(id: string): HTMLElement;
  apiKeyInput: HTMLInputElement;
  enableBtn: HTMLButtonElement;
  disableBtn: HTMLButtonElement;
  forgetKeyBtn: HTMLButtonElement;
  toggleKeyBtn: HTMLButtonElement;
  themeToggleBtn: HTMLButtonElement;
  errorMsg: HTMLElement;
  versionLine: HTMLElement;
  operationStatus: HTMLElement;
  operationStatusText: HTMLElement;
  themeIconSun: HTMLElement;
  themeIconMoon: HTMLElement;
  keyIconShow: HTMLElement;
  keyIconHide: HTMLElement;
}

const VIEW_IDS = ["state-loading", "state-not-detected", "state-idle", "state-active"] as const;

/**
 * A tab the popup must never pick up: it is listed first, so a query that does
 * not ask for the active tab of the current window resolves to this one.
 */
const OTHER_WINDOW_TAB = {
  id: 8,
  url: "https://background.example.com/",
  active: false,
  currentWindow: false,
};

class FakeStorageArea {
  private data = new Map<string, unknown>();
  private held: (() => void)[] | null = null;

  get = vi.fn(async (keys: string | string[] | null): Promise<Record<string, unknown>> => {
    // Snapshot at call time: a slow read returns what was stored when it
    // started, not what a later write left behind.
    const result: Record<string, unknown> = {};
    if (keys === null) {
      Object.assign(result, Object.fromEntries(this.data));
    } else {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (this.data.has(key)) result[key] = this.data.get(key);
      }
    }
    if (this.held) await new Promise<void>((resolve) => this.held?.push(resolve));
    return result;
  });

  hold(): void {
    this.held = [];
  }

  release(): void {
    const waiting = this.held ?? [];
    this.held = null;
    for (const resolve of waiting) resolve();
  }

  set = vi.fn(async (items: Record<string, unknown>): Promise<void> => {
    for (const [key, value] of Object.entries(items)) this.data.set(key, value);
  });
}

/**
 * Stage the popup's DOM and a chrome.* fake. Call from beforeEach, configure
 * the fake, then await `start()`.
 */
export function createPopupHarness(): PopupHarness {
  vi.useFakeTimers();
  document.documentElement.className = "";
  document.body.innerHTML = BODY_HTML;

  const local = new FakeStorageArea();
  const serviceWorkerReplies = new Map<MessageType, Reply>();
  const contentScriptReplies = new Map<MessageType, Reply>();
  const sentToServiceWorker: Message[] = [];
  const sentToTabs: SentTabMessage[] = [];
  const runtimeListeners: ((message: Message, sender: chrome.runtime.MessageSender) => void)[] = [];
  const connections: { name: string }[] = [];

  let activeTab: { id?: number; url?: string } | null = null;
  let leaseBehaviour: LeaseBehaviour = "acknowledge";
  let registeredLeaseId: string | undefined;

  const executeScript = vi.fn(async () => [{ frameId: 0, result: undefined }]);

  const runtime = {
    lastError: undefined as { message: string } | undefined,
    onMessage: {
      addListener: (fn: (message: Message, sender: chrome.runtime.MessageSender) => void) => {
        runtimeListeners.push(fn);
      },
    },
    sendMessage: vi.fn((message: Message, callback?: (response?: unknown) => void) => {
      sentToServiceWorker.push(message);
      deliver(resolveReply(serviceWorkerReplies.get(message.type), message), callback);
    }),
    connect: vi.fn((info: { name: string }): FakePort => {
      connections.push(info);
      return createPort(info.name);
    }),
  };

  const fake = {
    storage: { local },
    runtime,
    tabs: {
      query: vi.fn(async (filter: chrome.tabs.QueryInfo) => {
        const all = [
          OTHER_WINDOW_TAB,
          ...(activeTab === null ? [] : [{ ...activeTab, active: true, currentWindow: true }]),
        ];
        return all.filter(
          (tab) =>
            (filter.active === undefined || tab.active === filter.active) &&
            (filter.currentWindow === undefined || tab.currentWindow === filter.currentWindow),
        );
      }),
      sendMessage: vi.fn(
        (tabId: number, message: Message, callback?: (response?: unknown) => void) => {
          sentToTabs.push({ tabId, message });
          deliver(resolveReply(contentScriptReplies.get(message.type), message), callback);
        },
      ),
    },
    scripting: { executeScript },
  };

  vi.stubGlobal("chrome", fake);
  setSystemDark(false);

  function resolveReply(reply: Reply, message: Message): unknown {
    return typeof reply === "function" ? (reply as (m: Message) => unknown)(message) : reply;
  }

  function deliver(reply: unknown, callback?: (response?: unknown) => void): void {
    // Chrome always answers asynchronously, and lastError is readable only for
    // the duration of the callback.
    void Promise.resolve()
      .then(() => reply)
      .then((settled) => {
        if (settled instanceof RuntimeFailure) {
          runtime.lastError = { message: settled.message };
          callback?.(undefined);
          runtime.lastError = undefined;
          return;
        }
        callback?.(settled);
      });
  }

  function createPort(name: string): FakePort {
    const messageListeners: ((message: unknown) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    const disconnect = () => {
      for (const listener of [...disconnectListeners]) listener();
    };
    return {
      name,
      postMessage: (message: unknown) => {
        const registration = message as { type?: string; leaseId?: string };
        if (registration.type !== "REGISTER_POPUP") return;
        registeredLeaseId = registration.leaseId;
        if (leaseBehaviour === "silent") return;
        void Promise.resolve().then(() => {
          if (leaseBehaviour === "disconnect") {
            disconnect();
            return;
          }
          const type = leaseBehaviour === "other-message" ? "SESSION_REVOKED" : "POPUP_REGISTERED";
          const leaseId =
            leaseBehaviour === "wrong-lease" ? "some-other-popup-lease" : registration.leaseId;
          for (const listener of [...messageListeners]) listener({ type, leaseId });
        });
      },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    };
  }

  function setSystemDark(dark: boolean | null): void {
    if (dark === null) {
      vi.stubGlobal("matchMedia", undefined);
      return;
    }
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: dark && query.includes("dark") })),
    );
  }

  async function flush(): Promise<void> {
    for (let round = 0; round < FLUSH_ROUNDS; round++) {
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  async function dispatch(message: Message, sender: chrome.runtime.MessageSender): Promise<void> {
    for (const listener of [...runtimeListeners]) listener(message, sender);
    await flush();
  }

  const el = (id: string): HTMLElement => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`popup.html has no #${id}`);
    return element;
  };

  return {
    setActiveTab: (tab) => {
      activeTab = tab;
    },
    seedCredentials: (origin, apiKey) => setCredentials(origin, { apiKey, validated: true }),
    seedTheme: (value) => local.set({ comvi_theme: value }),
    setSystemDark,
    onServiceWorker: (type, reply) => serviceWorkerReplies.set(type, reply),
    onContentScript: (type, reply) => contentScriptReplies.set(type, reply),
    setLeaseBehaviour: (behaviour) => {
      leaseBehaviour = behaviour;
    },

    holdStorageReads: () => local.hold(),
    async releaseStorageReads() {
      local.release();
      await flush();
    },

    async start() {
      vi.resetModules();
      await import("../popup");
      await flush();
    },
    flush,

    serviceWorkerMessages: () => sentToServiceWorker,
    contentScriptMessages: () => sentToTabs,
    executeScript,
    runtimeSendMessage: runtime.sendMessage,
    storageGet: local.get,
    tabsQuery: fake.tabs.query,
    leaseConnections: () => connections,
    registeredLeaseId: () => registeredLeaseId,

    fromServiceWorker: (message) => dispatch(message, {}),
    fromTab: (tabId, message) => dispatch(message, { tab: { id: tabId } as chrome.tabs.Tab }),

    visibleViews: () =>
      VIEW_IDS.filter((id) => !el(id).classList.contains("hidden")).map((id) =>
        id.replace("state-", ""),
      ),
    el,
    get apiKeyInput() {
      return el("api-key") as HTMLInputElement;
    },
    get enableBtn() {
      return el("enable-btn") as HTMLButtonElement;
    },
    get disableBtn() {
      return el("disable-btn") as HTMLButtonElement;
    },
    get forgetKeyBtn() {
      return el("forget-key-btn") as HTMLButtonElement;
    },
    get toggleKeyBtn() {
      return el("toggle-key-btn") as HTMLButtonElement;
    },
    get themeToggleBtn() {
      return el("theme-toggle") as HTMLButtonElement;
    },
    get errorMsg() {
      return el("error-msg");
    },
    get versionLine() {
      return el("version-line");
    },
    get operationStatus() {
      return el("operation-status");
    },
    get operationStatusText() {
      return el("operation-status-text");
    },
    get themeIconSun() {
      return el("theme-icon-sun");
    },
    get themeIconMoon() {
      return el("theme-icon-moon");
    },
    get keyIconShow() {
      return el("key-icon-show");
    },
    get keyIconHide() {
      return el("key-icon-hide");
    },
  };
}
