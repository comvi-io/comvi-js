/**
 * Alt-click on translated text, through the real runtime: Core, DOMWatcher,
 * scanner, registry and highlighter over a real DOM. Only the two lazily
 * loaded UI chunks are doubles, so every assertion is what the translator
 * would see open — the modal for one key, the selector for several, or nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = await vi.hoisted(() => import("./helpers/editorUiMocks"));
vi.mock("../src/EditModal", ui.mockEditModalModule);
vi.mock("../src/KeySelector", ui.mockKeySelectorModule);

import { Core } from "../src/Core";
import { encodeKeyToInvisible, registerKey, resetEncoder } from "../src/translation";
import {
  cleanupDOM,
  flushDOMMutations,
  flushPendingImports,
  mockBoundingClientRect,
  simulateMouseEvent,
} from "./helpers";
import { altClick, renderMarked, renderText } from "./helpers/editorPage";

const UI_ERROR = "[@comvi/plugin-in-context-editor] Failed to load editor UI:";

let container: HTMLElement;
let core: Core;

/** `<div>` holding two translated text nodes side by side: `Home` and `Total`. */
function renderTwoKeyElement(): HTMLElement {
  const element = document.createElement("div");
  element.append(
    document.createTextNode(`Home${encodeKeyToInvisible(registerKey("home.title"))}`),
    document.createElement("br"),
    document.createTextNode(
      `Total${encodeKeyToInvisible(registerKey("checkout.total", "checkout"))}`,
    ),
  );
  mockBoundingClientRect(element, { top: 0, left: 0, width: 100, height: 40 });
  container.appendChild(element);
  return element;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  core = new Core({ targetElement: container });
  core.start();
});

afterEach(() => {
  core.stop();
  cleanupDOM();
  resetEncoder();
  ui.resetEditorUiMocks();
});

describe("Alt-click on text carrying one key", () => {
  it("one key → the modal opens for that key under the clicking runtime's id, no selector", async () => {
    const heading = renderMarked("home.title", { text: "Home", parent: container });

    await altClick(heading);

    expect({ modals: ui.openedModals(), selectors: ui.openedSelectors() }).toEqual({
      modals: [{ key: "home.title", ns: "default", instanceId: core.getInstanceId() }],
      selectors: [],
    });
  });

  it("stop() before the modal chunk resolves → no modal opens", async () => {
    const heading = renderMarked("home.title", { text: "Home", parent: container });
    await flushDOMMutations();
    simulateMouseEvent(heading, "click", { altKey: true });

    core.stop();
    await flushPendingImports();

    expect(ui.openedModals()).toEqual([]);
  });

  it("modal chunk throws while opening → the failure is logged once", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("chunk failed");
    ui.showModalMock.mockImplementationOnce(() => {
      throw failure;
    });
    const heading = renderMarked("home.title", { text: "Home", parent: container });

    await altClick(heading);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(UI_ERROR, failure);
  });
});

describe("Alt-click on an element carrying several keys", () => {
  it("two translated text nodes → the selector offers both keys in order, anchored on the element", async () => {
    const element = renderTwoKeyElement();

    await altClick(element);

    expect(ui.openedSelectors()).toEqual([
      {
        keyData: [
          { key: "home.title", ns: "default", textPreview: "Home" },
          { key: "checkout.total", ns: "checkout", textPreview: "Total" },
        ],
        anchor: element,
        instanceId: core.getInstanceId(),
      },
    ]);
  });

  it("two translated text nodes → no modal opens before a key is chosen", async () => {
    const element = renderTwoKeyElement();

    await altClick(element);

    expect(ui.openedModals()).toEqual([]);
  });

  it("key chosen in the selector → the modal opens for the chosen key", async () => {
    await altClick(renderTwoKeyElement());

    ui.chooseInSelector(0, "checkout.total", "checkout");

    expect(ui.openedModals()).toEqual([
      { key: "checkout.total", ns: "checkout", instanceId: core.getInstanceId() },
    ]);
  });

  it("stop() before the selector chunk resolves → no selector opens", async () => {
    const element = renderTwoKeyElement();
    await flushDOMMutations();
    simulateMouseEvent(element, "click", { altKey: true });

    core.stop();
    await flushPendingImports();

    expect(ui.openedSelectors()).toEqual([]);
  });

  it("key chosen after the runtime was stopped → no modal opens", async () => {
    await altClick(renderTwoKeyElement());
    core.stop();

    ui.chooseInSelector(0, "checkout.total", "checkout");

    expect(ui.openedModals()).toEqual([]);
  });

  it("selector chunk throws while opening → the failure is logged once", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("selector failed");
    ui.showKeySelectorMock.mockImplementationOnce(() => {
      throw failure;
    });

    await altClick(renderTwoKeyElement());

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(UI_ERROR, failure);
  });
});

describe("Alt-click on an element with nothing to edit", () => {
  it("text without a marker → neither the modal nor the selector opens", async () => {
    const plain = renderText("Plain text", container);

    await altClick(plain);

    expect({ modals: ui.openedModals(), selectors: ui.openedSelectors() }).toEqual({
      modals: [],
      selectors: [],
    });
  });

  it("registry no longer holds the highlighted element at click time → neither the modal nor the selector opens", async () => {
    // Defensive path: the highlighter and the registry share one event bus, so
    // the pipeline itself never lets them disagree. The public registry is
    // made to miss the element to reach it.
    const heading = renderMarked("home.title", { text: "Home", parent: container });
    await flushDOMMutations();
    vi.spyOn(core.getRegistry(), "get").mockReturnValue(undefined);

    await altClick(heading);

    expect({ modals: ui.openedModals(), selectors: ui.openedSelectors() }).toEqual({
      modals: [],
      selectors: [],
    });
  });

  it("element registered through getRegistry() with no text nodes → neither the modal nor the selector opens", async () => {
    const empty = renderText("Nothing tracked", container);
    core.getRegistry().add(empty, { nodes: new Map() });

    await altClick(empty);

    expect({ modals: ui.openedModals(), selectors: ui.openedSelectors() }).toEqual({
      modals: [],
      selectors: [],
    });
  });

  it("element registered through getRegistry() with no text nodes → no editor-UI error is logged", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const empty = renderText("Nothing tracked", container);
    core.getRegistry().add(empty, { nodes: new Map() });

    await altClick(empty);

    expect(consoleError).not.toHaveBeenCalled();
  });
});
