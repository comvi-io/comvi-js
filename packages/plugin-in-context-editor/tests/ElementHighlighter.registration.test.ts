import { describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { ElementHighlighter } from "../src/ElementHighlighter";
import type { EventBus } from "../src/EventBus";
import {
  cleanupDOM,
  simulateKeyEvent,
  simulateMouseEvent,
  mockBoundingClientRect,
  getActiveOverlay,
  getActiveTooltip,
} from "./helpers";
import {
  createHighlighterFixture,
  restorePageScroll,
  appendElement,
  registerKeysOn,
} from "./helpers/elementHighlighter";

describe("ElementHighlighter — registered elements and teardown", () => {
  let highlighter: ElementHighlighter;
  let handleClick: Mock<(element: Element) => void>;
  let eventBus: EventBus;

  function registerKeys(element: Element, keys: Array<{ key: string; ns?: string }>): void {
    registerKeysOn(eventBus, element, keys);
  }

  beforeEach(() => {
    ({ highlighter, handleClick, eventBus } = createHighlighterFixture());
  });

  afterEach(() => {
    highlighter.cleanup();
    cleanupDOM();
    restorePageScroll();
  });

  describe("Multiple elements", () => {
    it("Alt+click on two of three highlighted elements → the handler gets exactly those two, in order", () => {
      const elements = Array.from({ length: 3 }, (_, i) => {
        const div = document.createElement("div");
        div.textContent = `Element ${i}`;
        mockBoundingClientRect(div, { top: i * 50, left: 0, width: 100, height: 40 });
        document.body.appendChild(div);
        return div;
      });

      elements.forEach((el) => highlighter.addHighlight(el));

      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(elements[0], "mouseover");
      simulateMouseEvent(elements[0], "click");
      simulateMouseEvent(elements[2], "mouseover");
      simulateMouseEvent(elements[2], "click");

      expect(handleClick.mock.calls).toEqual([[elements[0]], [elements[2]]]);

      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("Shadow DOM interaction", () => {
    it("Alt+click on a highlighted element inside an open shadow root → the handler gets that element", () => {
      const host = document.createElement("div");
      const shadowRoot = host.attachShadow({ mode: "open" });
      const button = document.createElement("button");
      button.textContent = "Shadow button";
      mockBoundingClientRect(button, { top: 20, left: 20, width: 100, height: 30 });
      shadowRoot.appendChild(button);
      document.body.appendChild(host);

      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover", { composed: true });
      simulateMouseEvent(button, "click", { composed: true });

      expect(handleClick).toHaveBeenCalledWith(button);

      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("unregistering the hovered element", () => {
    it("removes the overlay of the element being unregistered", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      highlighter.removeHighlightFromElement(button);

      expect(getActiveOverlay()).toBeNull();
      expect(getActiveTooltip()).toBeNull();
    });

    it("keeps the overlay when a different element is unregistered", () => {
      const hovered = appendElement({ top: 100, left: 0, width: 100, height: 30 });
      const other = appendElement({ top: 200, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(hovered);
      highlighter.addHighlight(other);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(hovered, "mouseover");

      highlighter.removeHighlightFromElement(other);

      expect(getActiveOverlay()).not.toBeNull();
    });
  });

  describe("registered element resolution", () => {
    it("resolves a click on a child of a registered element to that element", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      parent.appendChild(child);
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "click");

      expect(handleClick).toHaveBeenCalledWith(parent);
    });

    it("resolves a click whose target is a text node through the event path", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const textNode = document.createTextNode("Click me");
      parent.appendChild(textNode);
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      textNode.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      expect(handleClick).toHaveBeenCalledWith(parent);
    });

    it("keeps the overlay when the pointer moves between children of the same registered element", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const first = document.createElement("span");
      const second = document.createElement("span");
      parent.append(first, second);
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover");
      simulateMouseEvent(first, "mouseout", { relatedTarget: second });

      expect(getActiveOverlay()).not.toBeNull();
    });

    it("keeps the overlay when the pointer moves between shadow children of the same registered host", () => {
      const host = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const shadowRoot = host.attachShadow({ mode: "open" });
      const first = document.createElement("span");
      const second = document.createElement("span");
      shadowRoot.append(first, second);
      highlighter.addHighlight(host);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover", { composed: true });
      simulateMouseEvent(first, "mouseout", { composed: true, relatedTarget: second });

      expect(getActiveOverlay()).not.toBeNull();
    });

    it("hides the overlay when the pointer moves to a different registered element", () => {
      const left = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const right = appendElement({ top: 60, left: 0, width: 100, height: 30 }, "div");
      highlighter.addHighlight(left);
      highlighter.addHighlight(right);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(left, "mouseover");
      simulateMouseEvent(left, "mouseout", { relatedTarget: right });

      expect(getActiveOverlay()).toBeNull();
    });

    it("hides the overlay when the pointer moves to a text node inside the registered element", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      const textNode = document.createTextNode("label");
      parent.append(child, textNode);
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "mouseover");
      simulateMouseEvent(child, "mouseout", { relatedTarget: textNode });

      expect(getActiveOverlay()).toBeNull();
    });

    it("ignores a mouseout raised outside every registered element", () => {
      const registered = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const stranger = appendElement({ top: 60, left: 0, width: 100, height: 30 }, "div");
      highlighter.addHighlight(registered);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(registered, "mouseover");
      simulateMouseEvent(stranger, "mouseout");

      expect(getActiveOverlay()).not.toBeNull();
    });
  });

  describe("ancestor lookup", () => {
    it("element registered after a failed lookup → Alt-click resolves it", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");
      highlighter.addHighlight(button);

      simulateMouseEvent(button, "click");

      // Exactly one call: the click before registration resolved nothing.
      expect(handleClick.mock.calls).toEqual([[button]]);
    });

    it("ancestor unregistered → Alt-click on its child resolves nothing", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      parent.appendChild(child);
      highlighter.addHighlight(parent);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "click");
      highlighter.removeHighlightFromElement(parent);

      simulateMouseEvent(child, "click");

      // Only the click made while the ancestor was registered resolved it.
      expect(handleClick.mock.calls).toEqual([[parent]]);
    });

    it("child moved out of its registered ancestor → Alt-click no longer selects the old parent", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      parent.appendChild(child);
      highlighter.addHighlight(parent);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "click");

      document.body.appendChild(child);
      simulateMouseEvent(child, "click");

      expect(handleClick.mock.calls).toEqual([[parent]]);
    });

    it("child moved from one registered container into another → Alt-click selects the new one", () => {
      const first = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const second = appendElement({ top: 60, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      first.appendChild(child);
      highlighter.addHighlight(first);
      highlighter.addHighlight(second);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "click");

      second.appendChild(child);
      simulateMouseEvent(child, "click");

      expect(handleClick.mock.calls).toEqual([[first], [second]]);
    });

    it("related target moved into the registered element → mouseout keeps the overlay", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      parent.appendChild(child);
      const stranger = appendElement({ top: 60, left: 0, width: 100, height: 30 }, "div");
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "mouseover");
      simulateMouseEvent(child, "mouseout", { relatedTarget: stranger });
      parent.appendChild(stranger);
      simulateMouseEvent(child, "mouseover");
      simulateMouseEvent(child, "mouseout", { relatedTarget: stranger });

      expect(getActiveOverlay()).not.toBeNull();
    });
  });

  describe("translation events", () => {
    it("shows the key delivered by translationUpdated", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      eventBus.emit("translationUpdated", button, {
        nodes: new Map([[document.createTextNode("Bye"), { key: "farewell", ns: "common" }]]),
      });
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveTooltip()!.textContent).toBe("farewell (common)");
    });

    it("translationRemoved → Alt+hover on the element draws no overlay", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);
      eventBus.emit("translationRemoved", button);
      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).toBeNull();
    });

    it("translationRemoved, then highlighted again without keys → overlay shown but no key tooltip", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);
      eventBus.emit("translationRemoved", button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(button, "mouseover");

      expect({ overlay: getActiveOverlay() !== null, tooltip: getActiveTooltip() }).toEqual({
        overlay: true,
        tooltip: null,
      });
    });

    it("lists a key once when several nodes of an element share it", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [
        { key: "greeting", ns: "common" },
        { key: "greeting", ns: "common" },
      ]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveTooltip()!.textContent).toBe("greeting (common)");
    });

    it("omits the namespace of a key registered without one", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveTooltip()!.textContent).toBe("greeting");
    });

    it("omits the namespace of a key in the configured default namespace", () => {
      highlighter.cleanup();
      highlighter = new ElementHighlighter(eventBus, handleClick, { defaultNs: "common" });
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveTooltip()!.textContent).toBe("greeting");
    });
  });

  describe("Cleanup", () => {
    it("should remove all highlights and event listeners", () => {
      const buttons = Array.from({ length: 2 }, () => {
        const btn = document.createElement("button");
        mockBoundingClientRect(btn, { top: 0, left: 0, width: 100, height: 30 });
        document.body.appendChild(btn);
        return btn;
      });

      buttons.forEach((btn) => highlighter.addHighlight(btn));

      highlighter.cleanup();

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(buttons[0], "click");
      simulateMouseEvent(buttons[1], "click");

      expect(handleClick).not.toHaveBeenCalled();

      simulateKeyEvent("keyup", "Alt");
    });

    it("cleanup() called three times → does not throw", () => {
      expect(() => {
        highlighter.cleanup();
        highlighter.cleanup();
        highlighter.cleanup();
      }).not.toThrow();
    });
  });

  describe("teardown", () => {
    it("removes the visible overlay on cleanup", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      highlighter.cleanup();

      expect(getActiveOverlay()).toBeNull();
      expect(getActiveTooltip()).toBeNull();
    });

    it("ignores pointer input for an element registered after cleanup", () => {
      highlighter.cleanup();
      const button = appendElement({ top: 100, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateMouseEvent(button, "mouseover", { altKey: true });
      simulateMouseEvent(button, "click", { altKey: true });

      expect(getActiveOverlay()).toBeNull();
      expect(handleClick).not.toHaveBeenCalled();
    });
  });
});
