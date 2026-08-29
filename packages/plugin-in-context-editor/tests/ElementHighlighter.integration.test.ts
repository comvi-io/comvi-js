import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ElementHighlighter } from "../src/ElementHighlighter";
import { EventBus } from "../src/EventBus";
import { SCROLL_DEBOUNCE_DELAY } from "../src/config/highlight";
import {
  cleanupDOM,
  simulateKeyEvent,
  simulateMouseEvent,
  mockBoundingClientRect,
  getActiveOverlay,
  getActiveTooltip,
  flushAnimationFrame,
} from "./helpers";

describe("ElementHighlighter.integration.test.ts", () => {
  let highlighter: ElementHighlighter;
  let handleClick: ReturnType<typeof vi.fn>;
  let eventBus: EventBus;

  beforeEach(() => {
    handleClick = vi.fn();
    eventBus = new EventBus();
    highlighter = new ElementHighlighter(eventBus, handleClick);
  });

  afterEach(() => {
    highlighter.cleanup();
    cleanupDOM();
  });

  describe("Element highlighting", () => {
    it("should add element to highlighted set", () => {
      const button = document.createElement("button");
      button.textContent = "Click me";
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      // Observable behavior only: Alt+click must reach the handler.
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");

      expect(handleClick).toHaveBeenCalledWith(button);

      simulateKeyEvent("keyup", "Alt");
    });

    it("should throw error when adding null element", () => {
      expect(() => {
        highlighter.addHighlight(null as any);
      }).toThrow("Element cannot be null or undefined");
    });

    it("should remove highlight from element", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      highlighter.removeHighlightFromElement(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();

      simulateKeyEvent("keyup", "Alt");
    });

    it("should ignore removeHighlightFromElement for a never-highlighted element", () => {
      const highlighted = document.createElement("button");
      const stranger = document.createElement("button");
      mockBoundingClientRect(highlighted, { top: 0, left: 0, width: 100, height: 30 });
      document.body.append(highlighted, stranger);
      highlighter.addHighlight(highlighted);

      expect(() => highlighter.removeHighlightFromElement(stranger)).not.toThrow();

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(highlighted, "click");

      expect(handleClick).toHaveBeenCalledWith(highlighted);

      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("Alt key interaction", () => {
    it("should track Alt key state", () => {
      const button = document.createElement("button");
      button.textContent = "Test";
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();

      simulateKeyEvent("keyup", "Alt");

      expect(getActiveOverlay()).toBeNull();
    });

    it("should handle Option key (Mac)", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Option");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();

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

    it("should handle Alt+click using mouse event altKey when keydown is missed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "click", { altKey: true });

      expect(handleClick).toHaveBeenCalledWith(button);
    });

    it("should reset modifier state and overlay on window blur", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();

      window.dispatchEvent(new Event("blur"));

      expect(getActiveOverlay()).toBeNull();
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
    it("should handle mouseover on highlighted element with Alt pressed", () => {
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

    it("should handle mouseout", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 100, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      expect(getActiveOverlay()).not.toBeNull();

      simulateMouseEvent(button, "mouseout");

      expect(getActiveOverlay()).toBeNull();

      simulateKeyEvent("keyup", "Alt");
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

    it("should handle multiple cleanup calls safely", () => {
      expect(() => {
        highlighter.cleanup();
        highlighter.cleanup();
        highlighter.cleanup();
      }).not.toThrow();
    });
  });

  describe("Custom options", () => {
    it("should use custom highlight style", () => {
      highlighter.cleanup();
      highlighter = new ElementHighlighter(eventBus, handleClick, {
        highlightStyle: {
          borderColor: "blue",
          backgroundColor: "rgba(0, 0, 255, 0.1)",
          borderWidth: 3,
          zIndex: 20000,
        },
      });

      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay(20000);
      expect(overlay).not.toBeNull();
      expect(overlay!.style.border).toBe("3px solid blue");
      expect(overlay!.style.backgroundColor).toBe("rgba(0, 0, 255, 0.1)");

      simulateKeyEvent("keyup", "Alt");
    });

    it.each([
      [true, 1],
      [false, 0],
    ])(
      "should respect debug option — debug: %s warns %i time(s) about a detached element",
      (debug, expectedWarnings) => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        highlighter.cleanup();
        highlighter = new ElementHighlighter(eventBus, handleClick, { debug });

        const button = document.createElement("button");
        mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
        document.body.appendChild(button);
        highlighter.addHighlight(button);
        simulateKeyEvent("keydown", "Alt");
        simulateMouseEvent(button, "mouseover");

        button.remove();
        window.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

        expect(
          warn.mock.calls.filter(
            ([message]) =>
              message ===
              "[ElementHighlighter] Cannot update position: element is detached from DOM",
          ),
        ).toHaveLength(expectedWarnings);

        simulateKeyEvent("keyup", "Alt");
        vi.useRealTimers();
      },
    );
  });

  describe("Multiple elements", () => {
    it("should handle multiple highlighted elements", () => {
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

  describe("Overlay styling", () => {
    it("should create overlay with Comvi brand amber colors and angular border", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      expect(overlay).not.toBeNull();
      expect(overlay!.style.border).toContain("#D97706");
      expect(overlay!.style.backgroundColor).toBe("rgba(217, 119, 6, 0.12)");
      expect(overlay!.style.borderRadius).toBe("0px");
      expect(overlay!.style.cursor).toBe("pointer");

      simulateKeyEvent("keyup", "Alt");
    });

    it("should apply custom highlight style from options", () => {
      highlighter.cleanup();
      highlighter = new ElementHighlighter(eventBus, handleClick, {
        highlightStyle: {
          borderColor: "#e11d48",
          backgroundColor: "rgba(225, 29, 72, 0.1)",
        },
      });

      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      expect(overlay).not.toBeNull();
      expect(overlay!.style.border).toContain("#e11d48");
      expect(overlay!.style.backgroundColor).toBe("rgba(225, 29, 72, 0.1)");

      simulateKeyEvent("keyup", "Alt");
    });

    it("should start overlay with opacity 0 for fade-in", async () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      expect(overlay).not.toBeNull();
      expect(overlay!.style.opacity).toBe("0");

      await flushAnimationFrame();

      expect(overlay!.style.opacity).toBe("1");

      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("Tooltip", () => {
    it("should show tooltip with key when element is registered via event", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 50, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      // Register via EventBus (same as real flow)
      const textNode = document.createTextNode("Hello");
      button.appendChild(textNode);
      eventBus.emit("translationRegistered", button, {
        nodes: new Map([[textNode, { key: "greeting", ns: "common" }]]),
      });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const tooltip = getActiveTooltip();
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toBe("greeting (common)");

      simulateKeyEvent("keyup", "Alt");
    });

    it("should show count for multiple keys on same element", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 50, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      const node1 = document.createTextNode("Hello");
      const node2 = document.createTextNode("World");
      button.appendChild(node1);
      button.appendChild(node2);
      eventBus.emit("translationRegistered", button, {
        nodes: new Map([
          [node1, { key: "greeting", ns: "common" }],
          [node2, { key: "farewell", ns: "common" }],
        ]),
      });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const tooltip = getActiveTooltip();
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain("(+1)");

      simulateKeyEvent("keyup", "Alt");
    });

    it("should remove tooltip when highlight is removed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 50, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      const textNode = document.createTextNode("Hello");
      button.appendChild(textNode);
      eventBus.emit("translationRegistered", button, {
        nodes: new Map([[textNode, { key: "greeting", ns: "common" }]]),
      });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      expect(getActiveTooltip()).not.toBeNull();

      simulateKeyEvent("keyup", "Alt");
      expect(getActiveTooltip()).toBeNull();
    });

    it("should show the overlay but no tooltip for an element registered with no nodes", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 50, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);
      eventBus.emit("translationRegistered", button, { nodes: new Map() });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();
      expect(getActiveTooltip()).toBeNull();

      simulateKeyEvent("keyup", "Alt");
    });

    it("should clean up key map on translationRemoved event", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 50, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      const textNode = document.createTextNode("Hello");
      button.appendChild(textNode);
      eventBus.emit("translationRegistered", button, {
        nodes: new Map([[textNode, { key: "greeting", ns: "common" }]]),
      });

      eventBus.emit("translationRemoved", button);

      // After removal, hovering should not show tooltip
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      expect(getActiveTooltip()).toBeNull();

      simulateKeyEvent("keyup", "Alt");
    });
  });

  describe("Shadow DOM interaction", () => {
    it("should handle Alt+click on highlighted elements inside open shadow roots", () => {
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
});
