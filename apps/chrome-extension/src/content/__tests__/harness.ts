/**
 * Fakes for the two worlds a content script sits between: the page's window
 * (MAIN-world DOM events) and the extension runtime (chrome.*).
 *
 * The page fake lets an exception thrown by a listener propagate to whoever
 * dispatched the event. A real EventTarget reports it as an uncaught page
 * error instead, which a test would silently miss — and "never throw into the
 * page" is the invariant both content scripts are written to hold.
 */
import { vi } from "vitest";
import type { Message } from "../../shared/messages";

export interface PageWindow {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatchEvent(event: Event): boolean;
  /** How many listeners the scripts under test currently hold for `type`. */
  listenerCount(type: string): number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  [key: string]: unknown;
}

/** Build the page's window. Call after vi.useFakeTimers() so timers are controllable. */
export function createPageWindow(): PageWindow {
  const listeners = new Map<string, EventListener[]>();
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      const remaining = (listeners.get(type) ?? []).filter((entry) => entry !== listener);
      listeners.set(type, remaining);
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) {
        listener(event);
      }
      return true;
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
    setTimeout,
    clearTimeout,
  };
}

/** Collect the details of every `type` event the page sees, newest last. */
export function recordEvents(page: PageWindow, type: string): unknown[] {
  const details: unknown[] = [];
  page.addEventListener(type, ((event: CustomEvent) => {
    details.push(event.detail);
  }) as EventListener);
  return details;
}

/** Collect the JSON-decoded details of every `type` event the page sees. */
export function recordJsonEvents(page: PageWindow, type: string): unknown[] {
  const details: unknown[] = [];
  page.addEventListener(type, ((event: CustomEvent) => {
    details.push(JSON.parse(event.detail as string));
  }) as EventListener);
  return details;
}

/** How chrome.runtime.sendMessage behaves for one test. */
export type RuntimeResponder = (message: Message, respond: (response: unknown) => void) => void;

export interface ExtensionRuntime {
  /** Install as globalThis.chrome before importing the content script. */
  chrome: unknown;
  /** Every message the content script pushed to the extension, in order. */
  readonly sent: Message[];
  /** Replace the behaviour of chrome.runtime.sendMessage. */
  respondWith(responder: RuntimeResponder): void;
  /** Report a delivery failure on the next response, the way Chrome does. */
  failNextWith(lastError: string): void;
  /** Deliver a popup/service-worker command like chrome.runtime.onMessage does. */
  deliver(message: Message): DeliveredCommand;
}

export interface DeliveredCommand {
  /** Everything the content script passed to sendResponse. */
  responses: unknown[];
  /** The listener's return value — true keeps the message channel open. */
  keepsChannelOpen: unknown;
}

type OnMessageListener = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => unknown;

export interface ExtensionRuntimeOptions {
  /**
   * Deliver responses through a 0ms timer instead of synchronously, matching
   * Chrome's always-asynchronous callback. Flush with vi.advanceTimersByTime(0).
   */
  asyncResponses?: boolean;
}

/** Build the chrome.* surface both content scripts rely on. */
export function createExtensionRuntime(options: ExtensionRuntimeOptions = {}): ExtensionRuntime {
  const sent: Message[] = [];
  let responder: RuntimeResponder = (_message, respond) => respond(undefined);
  let pendingLastError: string | undefined;
  let onMessageListener: OnMessageListener | undefined;

  const runtime = {
    lastError: undefined as { message: string } | undefined,
    sendMessage: vi.fn((message: Message, callback?: (response: unknown) => void) => {
      sent.push(message);
      const respond = (response: unknown): void => {
        runtime.lastError =
          pendingLastError === undefined ? undefined : { message: pendingLastError };
        pendingLastError = undefined;
        try {
          callback?.(response);
        } finally {
          runtime.lastError = undefined;
        }
      };
      if (options.asyncResponses) {
        setTimeout(() => responder(message, respond), 0);
        return;
      }
      responder(message, respond);
    }),
    onMessage: {
      addListener: (listener: OnMessageListener) => {
        onMessageListener = listener;
      },
    },
  };

  return {
    chrome: { runtime },
    sent,
    respondWith(next) {
      responder = next;
    },
    failNextWith(lastError) {
      pendingLastError = lastError;
    },
    deliver(message) {
      if (!onMessageListener) {
        throw new Error("the content script registered no chrome.runtime.onMessage listener");
      }
      const responses: unknown[] = [];
      const keepsChannelOpen = onMessageListener(
        message,
        {} as chrome.runtime.MessageSender,
        (response) => {
          responses.push(response);
        },
      );
      return { responses, keepsChannelOpen };
    },
  };
}
