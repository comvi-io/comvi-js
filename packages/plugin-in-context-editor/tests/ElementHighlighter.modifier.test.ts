import { describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import type { ElementHighlighter } from "../src/ElementHighlighter";
import {
  cleanupDOM,
  simulateKeyEvent,
  simulateMouseEvent,
  mockBoundingClientRect,
  getActiveOverlay,
} from "./helpers";
import {
  createHighlighterFixture,
  restorePageScroll,
  appendElement,
} from "./helpers/elementHighlighter";

describe("ElementHighlighter — modifier key and Alt+click", () => {
  let highlighter: ElementHighlighter;
  let handleClick: Mock<(element: Element) => void>;

  beforeEach(() => {
    ({ highlighter, handleClick } = createHighlighterFixture());
  });

  afterEach(() => {
    highlighter.cleanup();
    cleanupDOM();
    restorePageScroll();
  });

  describe("Alt key interaction", () => {
    it("Alt keydown, then mouseover a highlighted element → the overlay is shown", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();
      simulateKeyEvent("keyup", "Alt");
    });

    it("Alt released over a highlighted element → the overlay is removed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      simulateKeyEvent("keyup", "Alt");

      expect(getActiveOverlay()).toBeNull();
    });

    it("Option (Mac) keydown, then mouseover a highlighted element → the overlay is shown", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Option");

      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();
      simulateKeyEvent("keyup", "Option");
    });

    it("Option (Mac) released over a highlighted element → the overlay is removed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Option");
      simulateMouseEvent(button, "mouseover");

      simulateKeyEvent("keyup", "Option");

      expect(getActiveOverlay()).toBeNull();
    });

    it("should highlight using mouse event altKey when keydown is missed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "mouseover", { altKey: true });

      expect(getActiveOverlay()).not.toBeNull();
    });

    it("Alt+click whose Alt keydown was never seen → the click handler still gets the element", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "click", { altKey: true });

      expect(handleClick).toHaveBeenCalledWith(button);
    });

    it("window blur while Alt-hovering → the overlay is removed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      window.dispatchEvent(new Event("blur"));

      expect(getActiveOverlay()).toBeNull();
    });

    it("window blur after Alt keydown → a later plain click is not treated as Alt+click", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      window.dispatchEvent(new Event("blur"));

      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("Click handling", () => {
    it("should call handleClick when element is clicked with Alt pressed", () => {
      const button = document.createElement("button");
      button.textContent = "Click me";
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(button, "click");

      expect(handleClick).toHaveBeenCalledWith(button);

      simulateKeyEvent("keyup", "Alt");
    });

    it("should not call handleClick when Alt is not pressed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should not call handleClick for non-highlighted elements", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();

      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("Mouseover/mouseout behavior", () => {
    it("Alt held, mouseover a highlighted element → the overlay is drawn at the element's top-left", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 100, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      expect(overlay).not.toBeNull();
      expect(overlay!.style.top).toBe("100px");
      expect(overlay!.style.left).toBe("100px");

      simulateKeyEvent("keyup", "Alt");
    });

    it("Alt held, mouseout from the hovered element → the overlay is removed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 100, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      simulateMouseEvent(button, "mouseout");

      expect(getActiveOverlay()).toBeNull();
      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("modifier handling", () => {
    it("Alt pressed while the pointer already rests on the element → the overlay is drawn at its top", () => {
      const button = appendElement({ top: 40, left: 20, width: 100, height: 30 });
      highlighter.addHighlight(button);
      simulateMouseEvent(button, "mouseover");

      simulateKeyEvent("keydown", "Alt");

      expect(getActiveOverlay()?.style.top).toBe("40px");
    });

    it("ignores a non-modifier key press while hovering a registered element", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Shift");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).toBeNull();
    });

    it("shows no overlay on hover without the modifier", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).toBeNull();
    });

    it("keeps the overlay when the pointer leaves without the modifier", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateMouseEvent(button, "mouseover", { altKey: true });
      simulateMouseEvent(button, "mouseout");

      expect(getActiveOverlay()).not.toBeNull();
    });

    it("keeps the overlay when Alt is pressed after the pointer left the element", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateMouseEvent(button, "mouseover", { altKey: true });
      simulateMouseEvent(button, "mouseout");
      simulateKeyEvent("keydown", "Alt");

      expect(getActiveOverlay()).not.toBeNull();
    });
  });

  describe("Alt+click interception", () => {
    it("prevents the page default action of an intercepted click", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      const notPrevented = button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, altKey: true }),
      );

      expect(notPrevented).toBe(false);
    });

    it("keeps an intercepted click away from the page's own listeners", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);
      const pageListeners: string[] = [];
      const onTarget = () => pageListeners.push("target");
      const onDocument = () => pageListeners.push("document");
      button.addEventListener("click", onTarget);
      document.addEventListener("click", onDocument, { capture: true });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");
      document.removeEventListener("click", onDocument, { capture: true });

      expect(handleClick).toHaveBeenCalledWith(button);
      expect(pageListeners).toEqual([]);
    });

    it("shows the overlay even when a wrapper stops mouseover propagation", () => {
      const wrapper = document.createElement("div");
      document.body.appendChild(wrapper);
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      wrapper.appendChild(button);
      wrapper.addEventListener("mouseover", (event) => event.stopPropagation());
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();
    });

    it("removes the overlay even when a wrapper stops mouseout propagation", () => {
      const wrapper = document.createElement("div");
      document.body.appendChild(wrapper);
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      wrapper.appendChild(button);
      wrapper.addEventListener("mouseout", (event) => event.stopPropagation());
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      simulateMouseEvent(button, "mouseout");

      expect(getActiveOverlay()).toBeNull();
    });
  });
});
