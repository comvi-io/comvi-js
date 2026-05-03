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

import { Core } from "../src/Core";

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

  it("should open modal when element has a single translation key", () => {
    const core = new Core({}, { apiKey: "test-key" } as any);
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

    capturedElementClickHandler?.(element);

    expect(showModalMock).toHaveBeenCalledWith("home.title", "default", instanceId);
    expect(showKeySelectorMock).not.toHaveBeenCalled();
    core.stop();
  });

  it("should show key selector when element has multiple keys, then open modal on selection", () => {
    const core = new Core({}, { apiKey: "test-key" } as any);
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

    capturedElementClickHandler?.(element);

    expect(showKeySelectorMock).toHaveBeenCalledTimes(1);
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
});
