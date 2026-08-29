import { beforeEach, describe, expect, it, vi } from "vitest";

const domWatcherCtorMock = vi.fn();
const domWatcherStartMock = vi.fn();
const domWatcherStopMock = vi.fn();

const translationRegistryCtorMock = vi.fn();
const registryGetMock = vi.fn();
const registryDestroyMock = vi.fn();

const translationScannerCtorMock = vi.fn();
const translationScannerDestroyMock = vi.fn();

const elementHighlighterCtorMock = vi.fn();
const elementHighlighterCleanupMock = vi.fn();
let capturedElementClickHandler: ((element: Element) => void) | null = null;

const eventBusCtorMock = vi.fn();
const eventBusRemoveAllListenersMock = vi.fn();

const showModalMock = vi.fn();
const cleanupEditModalMock = vi.fn();
const showKeySelectorMock = vi.fn();
const cleanupKeySelectorMock = vi.fn();

vi.mock("../src/DOMWatcher", () => ({
  DOMWatcher: function MockDOMWatcher(...args: unknown[]) {
    domWatcherCtorMock(...args);
    return {
      start: domWatcherStartMock,
      stop: domWatcherStopMock,
    };
  },
}));

vi.mock("../src/TranslationRegistry", () => ({
  TranslationRegistry: function MockTranslationRegistry(...args: unknown[]) {
    translationRegistryCtorMock(...args);
    return {
      get: registryGetMock,
      destroy: registryDestroyMock,
    };
  },
}));

vi.mock("../src/TranslationScanner", () => ({
  TranslationScanner: function MockTranslationScanner(...args: unknown[]) {
    translationScannerCtorMock(...args);
    return {
      destroy: translationScannerDestroyMock,
    };
  },
}));

vi.mock("../src/ElementHighlighter", () => ({
  ElementHighlighter: function MockElementHighlighter(...args: unknown[]) {
    elementHighlighterCtorMock(...args);
    capturedElementClickHandler = args[1] as (element: Element) => void;
    return {
      cleanup: elementHighlighterCleanupMock,
    };
  },
}));

vi.mock("../src/EventBus", () => ({
  EventBus: function MockEventBus(...args: unknown[]) {
    eventBusCtorMock(...args);
    return {
      removeAllListeners: eventBusRemoveAllListenersMock,
    };
  },
}));

vi.mock("../src/EditModal", () => ({
  showModal: (...args: unknown[]) => showModalMock(...args),
  cleanup: () => cleanupEditModalMock(),
}));

vi.mock("../src/KeySelector", () => ({
  showKeySelector: (...args: unknown[]) => showKeySelectorMock(...args),
  cleanup: () => cleanupKeySelectorMock(),
}));

import { Core, type EditorI18n } from "../src/Core";
import { flushMicrotasks } from "./helpers";

const HOST = { apiKey: "test-key" } as unknown as EditorI18n;

/** The click handler `Core` hands to `ElementHighlighter`, captured by ctor position. */
function clickElement(element: Element): void {
  if (!capturedElementClickHandler) {
    throw new Error("Core never handed a click handler to ElementHighlighter");
  }
  capturedElementClickHandler(element);
}

describe("Core unit behavior", () => {
  beforeEach(() => {
    domWatcherCtorMock.mockReset();
    domWatcherStartMock.mockReset();
    domWatcherStopMock.mockReset();

    translationRegistryCtorMock.mockReset();
    registryGetMock.mockReset();
    registryDestroyMock.mockReset();

    translationScannerCtorMock.mockReset();
    translationScannerDestroyMock.mockReset();

    elementHighlighterCtorMock.mockReset();
    elementHighlighterCleanupMock.mockReset();
    capturedElementClickHandler = null;

    eventBusCtorMock.mockReset();
    eventBusRemoveAllListenersMock.mockReset();

    showModalMock.mockReset();
    cleanupEditModalMock.mockReset();
    showKeySelectorMock.mockReset();
    cleanupKeySelectorMock.mockReset();
  });

  it("should open modal when element has a single translation key", async () => {
    const core = new Core({}, HOST);
    const instanceId = core.getInstanceId();
    const element = document.createElement("div");
    const textNode = document.createTextNode("text");

    registryGetMock.mockReturnValue({
      nodes: new Map([
        [
          textNode,
          {
            key: "home.title",
            ns: "default",
            textPreview: "Home",
          },
        ],
      ]),
    });

    clickElement(element);

    await vi.waitFor(() => {
      expect(showModalMock).toHaveBeenCalledWith("home.title", "default", instanceId);
    });
    expect(showKeySelectorMock).not.toHaveBeenCalled();
    core.stop();
  });

  it("should show key selector when element has multiple keys, then open modal on selection", async () => {
    const core = new Core({}, HOST);
    const instanceId = core.getInstanceId();
    const element = document.createElement("div");
    const textNodeA = document.createTextNode("a");
    const textNodeB = document.createTextNode("b");

    registryGetMock.mockReturnValue({
      nodes: new Map([
        [
          textNodeA,
          {
            key: "home.title",
            ns: "default",
            textPreview: "Home",
          },
        ],
        [
          textNodeB,
          {
            key: "checkout.total",
            ns: "checkout",
            textPreview: "Total",
          },
        ],
      ]),
    });

    clickElement(element);

    await vi.waitFor(() => {
      expect(showKeySelectorMock).toHaveBeenCalledTimes(1);
    });
    const [keyData, targetElement, onSelect] = showKeySelectorMock.mock.calls[0] as [
      Array<{ key: string; ns: string; textPreview?: string }>,
      Element,
      (key: string, ns: string) => void,
    ];

    expect(targetElement).toBe(element);
    expect(keyData).toEqual([
      { key: "home.title", ns: "default", textPreview: "Home" },
      { key: "checkout.total", ns: "checkout", textPreview: "Total" },
    ]);

    onSelect("checkout.total", "checkout");
    expect(showModalMock).toHaveBeenCalledWith("checkout.total", "checkout", instanceId);
    core.stop();
  });

  it("does not open lazy UI when stopped before the import resolves", async () => {
    const core = new Core({}, HOST);
    const element = document.createElement("div");
    registryGetMock.mockReturnValue({
      nodes: new Map([[document.createTextNode("text"), { key: "home.title", ns: "default" }]]),
    });

    clickElement(element);
    core.stop();
    await flushMicrotasks();

    expect(showModalMock).not.toHaveBeenCalled();
  });

  it("opens neither the modal nor the selector for an element missing from the registry", async () => {
    const core = new Core({}, HOST);
    registryGetMock.mockReturnValue(undefined);

    clickElement(document.createElement("div"));
    await flushMicrotasks();

    expect(showModalMock).not.toHaveBeenCalled();
    expect(showKeySelectorMock).not.toHaveBeenCalled();

    core.stop();
  });

  it("opens neither the modal nor the selector for a registry entry with no nodes", async () => {
    const core = new Core({}, HOST);
    registryGetMock.mockReturnValue({ nodes: new Map() });

    clickElement(document.createElement("div"));
    await flushMicrotasks();

    expect(showModalMock).not.toHaveBeenCalled();
    expect(showKeySelectorMock).not.toHaveBeenCalled();

    core.stop();
  });

  it("reports lazy UI failures without leaking an unhandled rejection", async () => {
    const core = new Core({}, HOST);
    const element = document.createElement("div");
    const error = new Error("chunk failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    showModalMock.mockImplementationOnce(() => {
      throw error;
    });
    registryGetMock.mockReturnValue({
      nodes: new Map([[document.createTextNode("text"), { key: "home.title", ns: "default" }]]),
    });

    expect(() => clickElement(element)).not.toThrow();
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("[comvi] Failed to load editor UI:", error);
    });

    core.stop();
  });
});
