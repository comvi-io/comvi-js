import { beforeEach, describe, expect, it, vi } from "vitest";

let capturedElementClickHandler: ((element: Element) => void) | null = null;
const registryGetMock = vi.fn();
const showKeySelectorMock = vi.fn();

vi.mock("../src/DOMWatcher", () => ({
  DOMWatcher: function MockDOMWatcher() {
    return { start: () => undefined, stop: () => undefined };
  },
}));

vi.mock("../src/TranslationRegistry", () => ({
  TranslationRegistry: function MockTranslationRegistry() {
    return { get: registryGetMock, destroy: () => undefined };
  },
}));

vi.mock("../src/TranslationScanner", () => ({
  TranslationScanner: function MockTranslationScanner() {
    return { destroy: () => undefined };
  },
}));

vi.mock("../src/ElementHighlighter", () => ({
  ElementHighlighter: function MockElementHighlighter(...args: unknown[]) {
    capturedElementClickHandler = args[1] as (element: Element) => void;
    return { cleanup: () => undefined };
  },
}));

vi.mock("../src/EventBus", () => ({
  EventBus: function MockEventBus() {
    return { removeAllListeners: () => undefined };
  },
}));

vi.mock("../src/KeySelector", () => ({
  showKeySelector: (...args: unknown[]) => showKeySelectorMock(...args),
  cleanup: () => undefined,
}));

/**
 * `Core` imports the edit-modal chunk lazily on the first click, so a module
 * factory that throws is how a chunk that fails to download reaches it: the
 * dynamic `import()` rejects instead of resolving. Both click paths need it —
 * the single-key one awaits the chunk alone, the multi-key one awaits it
 * alongside the key selector through `Promise.all`.
 */
vi.mock("../src/EditModal", () => {
  throw new Error("chunk failed");
});

import { Core, type EditorI18n } from "../src/Core";
import { flushPendingImports } from "./helpers";

const HOST = { apiKey: "test-key" } as unknown as EditorI18n;

const SINGLE_KEY_ENTRY = () => ({
  nodes: new Map([[document.createTextNode("text"), { key: "home.title", ns: "default" }]]),
});

const TWO_KEY_ENTRY = () => ({
  nodes: new Map([
    [document.createTextNode("a"), { key: "home.title", ns: "default" }],
    [document.createTextNode("b"), { key: "checkout.total", ns: "checkout" }],
  ]),
});

/** The click handler `Core` hands to `ElementHighlighter`, captured by ctor position. */
function clickElement(element: Element): void {
  if (!capturedElementClickHandler) {
    throw new Error("Core never handed a click handler to ElementHighlighter");
  }
  capturedElementClickHandler(element);
}

describe("Core — an editor-UI chunk that fails to load", () => {
  beforeEach(() => {
    capturedElementClickHandler = null;
    registryGetMock.mockReset();
    showKeySelectorMock.mockReset();
  });

  it("reports a single-key click's failure when the Core is still running", async () => {
    const core = new Core({}, HOST);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registryGetMock.mockReturnValue(SINGLE_KEY_ENTRY());

    clickElement(document.createElement("div"));
    await flushPendingImports();

    expect(consoleError).toHaveBeenCalledWith(
      "[comvi] Failed to load editor UI:",
      expect.any(Error),
    );
    core.stop();
  });

  it("reports nothing for a single-key click whose failure arrives after stop()", async () => {
    const core = new Core({}, HOST);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registryGetMock.mockReturnValue(SINGLE_KEY_ENTRY());

    clickElement(document.createElement("div"));
    core.stop();
    await flushPendingImports();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reports a multi-key click's failure when the Core is still running", async () => {
    const core = new Core({}, HOST);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registryGetMock.mockReturnValue(TWO_KEY_ENTRY());

    clickElement(document.createElement("div"));
    await flushPendingImports();

    expect(consoleError).toHaveBeenCalledWith(
      "[comvi] Failed to load editor UI:",
      expect.any(Error),
    );
    core.stop();
  });

  it("reports nothing for a multi-key click whose failure arrives after stop()", async () => {
    const core = new Core({}, HOST);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registryGetMock.mockReturnValue(TWO_KEY_ENTRY());

    clickElement(document.createElement("div"));
    core.stop();
    await flushPendingImports();

    expect(consoleError).not.toHaveBeenCalled();
    expect(showKeySelectorMock).not.toHaveBeenCalled();
  });
});
