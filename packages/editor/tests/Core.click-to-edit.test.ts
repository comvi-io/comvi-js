/**
 * Alt-click on translated text, through the real runtime: Core, DOMWatcher,
 * scanner, registry and highlighter over a real DOM. Only the two lazily
 * loaded UI chunks are doubles, so every assertion is what the translator
 * would see open — the modal for one key, the selector for several, or nothing.
 *
 * Timing is controlled, not waited out. Each test imports a fresh Core, so the
 * first click really performs the dynamic import of a UI chunk, and that
 * import is gated (`holdUiImports`). A claim that something opens polls for
 * it. A claim that nothing opens is settled by a SENTINEL: a second running
 * Core clicks after the act, the gate is released, and the sentinel's own UI
 * appearing proves the earlier click's continuation has already run — both
 * wait on the same import promise, in click order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = await vi.hoisted(() => import("./helpers/editorUiMocks"));
vi.mock("../src/EditModal", ui.mockEditModalModule);
vi.mock("../src/KeySelector", ui.mockKeySelectorModule);

import {
  cleanupDOM,
  flushDOMMutations,
  mockBoundingClientRect,
  simulateMouseEvent,
} from "./helpers";

type CoreModule = typeof import("../src/Core");
type TranslationModule = typeof import("../src/translation");

const UI_ERROR = "[@comvi/plugin-in-context-editor] Failed to load editor UI:";

let Core: CoreModule["Core"];
let translation: TranslationModule;
let container: HTMLElement;
let core: InstanceType<CoreModule["Core"]>;
let sentinel: InstanceType<CoreModule["Core"]>;
let sentinelContainer: HTMLElement;

function boxed<T extends HTMLElement>(element: T, parent: HTMLElement): T {
  mockBoundingClientRect(element, { top: 0, left: 0, width: 100, height: 40 });
  parent.appendChild(element);
  return element;
}

/** `<p>` whose text carries the marker of `key`, on the fresh Core's encoder. */
function renderMarked(key: string, text: string, parent = container): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.textContent = `${text}${translation.encodeKeyToInvisible(translation.registerKey(key))}`;
  return boxed(paragraph, parent);
}

function renderPlain(text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return boxed(paragraph, container);
}

/** `<div>` holding two translated text nodes side by side. */
function renderTwoKeyElement(
  first = { key: "home.title", ns: "default", text: "Home" },
  second = { key: "checkout.total", ns: "checkout", text: "Total" },
  parent = container,
): HTMLElement {
  const marked = (entry: typeof first) =>
    `${entry.text}${translation.encodeKeyToInvisible(translation.registerKey(entry.key, entry.ns))}`;
  const element = document.createElement("div");
  element.append(
    document.createTextNode(marked(first)),
    document.createElement("br"),
    document.createTextNode(marked(second)),
  );
  return boxed(element, parent);
}

async function altClick(element: Element): Promise<void> {
  await flushDOMMutations();
  simulateMouseEvent(element, "click", { altKey: true });
}

/**
 * Settles every UI continuation started so far: the sentinel Core clicks the
 * same kind of element (one key → modal chunk, several → both chunks), the
 * import gate is released, and the sentinel's UI is awaited.
 */
async function settleWithSentinel(kind: "modal" | "selector"): Promise<void> {
  const target =
    kind === "modal"
      ? renderMarked("sentinel.key", "Sentinel", sentinelContainer)
      : renderTwoKeyElement(
          { key: "sentinel.a", ns: "default", text: "A" },
          { key: "sentinel.b", ns: "default", text: "B" },
          sentinelContainer,
        );
  await altClick(target);
  ui.releaseUiImports();
  const sentinelId = sentinel.getInstanceId();
  await vi.waitFor(() =>
    expect(
      kind === "modal"
        ? ui.openedModals().some((modal) => modal.instanceId === sentinelId)
        : ui.openedSelectors().some((selector) => selector.instanceId === sentinelId),
    ).toBe(true),
  );
}

/** What opened for the runtime under test, the sentinel's own UI left out. */
function openedForCore() {
  const sentinelId = sentinel.getInstanceId();
  return {
    modals: ui.openedModals().filter((modal) => modal.instanceId !== sentinelId),
    selectors: ui.openedSelectors().filter((selector) => selector.instanceId !== sentinelId),
  };
}

beforeEach(async () => {
  vi.resetModules();
  ({ Core } = await import("../src/Core"));
  translation = await import("../src/translation");
  container = document.createElement("div");
  sentinelContainer = document.createElement("div");
  document.body.append(container, sentinelContainer);
  core = new Core({ targetElement: container });
  core.start();
  sentinel = new Core({ targetElement: sentinelContainer });
  sentinel.start();
});

afterEach(() => {
  core.stop();
  sentinel.stop();
  ui.resetEditorUiMocks();
  cleanupDOM();
  translation.resetEncoder();
});

describe("Alt-click on text carrying one key", () => {
  it("one key → the modal opens for that key under the clicking runtime's id, no selector", async () => {
    const heading = renderMarked("home.title", "Home");

    await altClick(heading);

    await vi.waitFor(() =>
      expect(openedForCore()).toEqual({
        modals: [{ key: "home.title", ns: "default", instanceId: core.getInstanceId() }],
        selectors: [],
      }),
    );
  });

  it("stop() before the modal chunk resolves → no modal opens", async () => {
    const heading = renderMarked("home.title", "Home");
    ui.holdUiImports();
    await altClick(heading);

    core.stop();

    await settleWithSentinel("modal");
    expect(openedForCore().modals).toEqual([]);
  });

  it("modal chunk throws while opening → the failure is logged once", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("chunk failed");
    ui.showModalMock.mockImplementationOnce(() => {
      throw failure;
    });
    const heading = renderMarked("home.title", "Home");

    await altClick(heading);

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledExactlyOnceWith(UI_ERROR, failure));
  });
});

describe("Alt-click on an element carrying several keys", () => {
  it("two translated text nodes → the selector offers both keys in order, anchored on the element", async () => {
    const element = renderTwoKeyElement();

    await altClick(element);

    await vi.waitFor(() =>
      expect(openedForCore().selectors).toEqual([
        {
          keyData: [
            { key: "home.title", ns: "default", textPreview: "Home" },
            { key: "checkout.total", ns: "checkout", textPreview: "Total" },
          ],
          anchor: element,
          instanceId: core.getInstanceId(),
        },
      ]),
    );
  });

  it("two translated text nodes → no modal opens before a key is chosen", async () => {
    const element = renderTwoKeyElement();

    await altClick(element);

    await settleWithSentinel("selector");
    expect(openedForCore().modals).toEqual([]);
  });

  it("key chosen in the selector → the modal opens for the chosen key", async () => {
    await altClick(renderTwoKeyElement());
    await vi.waitFor(() => expect(openedForCore().selectors).toHaveLength(1));

    ui.chooseInSelector(0, "checkout.total", "checkout");

    expect(openedForCore().modals).toEqual([
      { key: "checkout.total", ns: "checkout", instanceId: core.getInstanceId() },
    ]);
  });

  it("stop() before the selector chunk resolves → no selector opens", async () => {
    const element = renderTwoKeyElement();
    ui.holdUiImports();
    await altClick(element);

    core.stop();

    await settleWithSentinel("selector");
    expect(openedForCore().selectors).toEqual([]);
  });

  it("key chosen after the runtime was stopped → no modal opens", async () => {
    await altClick(renderTwoKeyElement());
    await vi.waitFor(() => expect(openedForCore().selectors).toHaveLength(1));
    core.stop();

    ui.chooseInSelector(0, "checkout.total", "checkout");

    expect(openedForCore().modals).toEqual([]);
  });

  it("selector chunk throws while opening → the failure is logged once", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("selector failed");
    ui.showKeySelectorMock.mockImplementationOnce(() => {
      throw failure;
    });

    await altClick(renderTwoKeyElement());

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledExactlyOnceWith(UI_ERROR, failure));
  });
});

describe("Alt-click on an element with nothing to edit", () => {
  it("text without a marker → neither the modal nor the selector opens", async () => {
    const plain = renderPlain("Plain text");

    await altClick(plain);

    await settleWithSentinel("modal");
    expect(openedForCore()).toEqual({ modals: [], selectors: [] });
  });

  it("registry no longer holds the highlighted element at click time → neither the modal nor the selector opens", async () => {
    // Defensive path: the highlighter and the registry share one event bus, so
    // the pipeline itself never lets them disagree. The public registry is
    // made to miss the element to reach it.
    const heading = renderMarked("home.title", "Home");
    await flushDOMMutations();
    vi.spyOn(core.getRegistry(), "get").mockReturnValue(undefined);

    await altClick(heading);

    await settleWithSentinel("modal");
    expect(openedForCore()).toEqual({ modals: [], selectors: [] });
  });

  it("element registered through getRegistry() with no text nodes → neither the modal nor the selector opens", async () => {
    const empty = renderPlain("Nothing tracked");
    core.getRegistry().add(empty, { nodes: new Map() });

    await altClick(empty);

    await settleWithSentinel("modal");
    expect(openedForCore()).toEqual({ modals: [], selectors: [] });
  });

  it("element registered through getRegistry() with no text nodes → no editor-UI error is logged", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const empty = renderPlain("Nothing tracked");
    core.getRegistry().add(empty, { nodes: new Map() });

    await altClick(empty);

    await settleWithSentinel("modal");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
