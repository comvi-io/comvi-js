/**
 * ElementHighlighter Integration Tests
 * Tests highlighting and interaction functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ElementHighlighter } from "../src/ElementHighlighter";
import { EventBus } from "../src/EventBus";
import {
  cleanupDOM,
  simulateKeyEvent,
  simulateMouseEvent,
  mockBoundingClientRect,
} from "./helpers";

describe("ElementHighlighter.integration.test.ts", () => {
  let highlighter: ElementHighlighter;
  let handleClick: ReturnType<typeof vi.fn>;
  let eventBus: EventBus;

  const getActiveOverlay = (): HTMLDivElement | null => {
    return (
      (Array.from(document.body.querySelectorAll("div")).find((node) => {
        const style = (node as HTMLDivElement).style;
        return (
          style.position === "absolute" &&
          style.pointerEvents === "none" &&
          style.zIndex === "10000"
        );
      }) as HTMLDivElement | undefined) ?? null
    );
  };

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

      // Verify element was added by testing observable behavior: Alt+click should trigger handler
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");

      expect(handleClick).toHaveBeenCalledWith(button);

      simulateKeyEvent("keyup", "Alt");
      button.remove();
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

      // Verify element was removed: Alt+click should NOT trigger handler
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();

      simulateKeyEvent("keyup", "Alt");
      button.remove();
    });
  });

  describe("Alt key interaction", () => {
    it("should track Alt key state", () => {
      const button = document.createElement("button");
      button.textContent = "Test";
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      expect(() => {
        // Press Alt
        simulateKeyEvent("keydown", "Alt");

        // Hover over element
        simulateMouseEvent(button, "mouseover");

        // Release Alt
        simulateKeyEvent("keyup", "Alt");
      }).not.toThrow();

      button.remove();
    });

    it("should handle Option key (Mac)", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      expect(() => {
        simulateKeyEvent("keydown", "Option");
        simulateMouseEvent(button, "mouseover");
        simulateKeyEvent("keyup", "Option");
      }).not.toThrow();

      button.remove();
    });

    it("should highlight using mouse event altKey when keydown is missed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "mouseover", { altKey: true });

      expect(getActiveOverlay()).not.toBeNull();

      button.remove();
    });

    it("should handle Alt+click using mouse event altKey when keydown is missed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "click", { altKey: true });

      expect(handleClick).toHaveBeenCalledWith(button);

      button.remove();
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

      button.remove();
    });
  });

  describe("Click handling", () => {
    it("should call handleClick when element is clicked with Alt pressed", () => {
      const button = document.createElement("button");
      button.textContent = "Click me";
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      // Press Alt
      simulateKeyEvent("keydown", "Alt");

      // Click element
      simulateMouseEvent(button, "click");

      expect(handleClick).toHaveBeenCalledWith(button);

      simulateKeyEvent("keyup", "Alt");
      button.remove();
    });

    it("should not call handleClick when Alt is not pressed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      // Click without Alt
      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();

      button.remove();
    });

    it("should not call handleClick for non-highlighted elements", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      // Don't add highlight
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");

      expect(handleClick).not.toHaveBeenCalled();

      simulateKeyEvent("keyup", "Alt");
      button.remove();
    });
  });

  describe("Mouseover/mouseout behavior", () => {
    it("should handle mouseover on highlighted element with Alt pressed", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 100, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      expect(() => {
        simulateKeyEvent("keydown", "Alt");
        simulateMouseEvent(button, "mouseover");
        simulateKeyEvent("keyup", "Alt");
      }).not.toThrow();

      button.remove();
    });

    it("should handle mouseout", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 100, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);

      expect(() => {
        simulateKeyEvent("keydown", "Alt");
        simulateMouseEvent(button, "mouseover");
        simulateMouseEvent(button, "mouseout");
        simulateKeyEvent("keyup", "Alt");
      }).not.toThrow();

      button.remove();
    });
  });

  describe("Cleanup", () => {
    it("should remove all highlights and event listeners", () => {
      const buttons = Array.from({ length: 5 }, () => {
        const btn = document.createElement("button");
        mockBoundingClientRect(btn, { top: 0, left: 0, width: 100, height: 30 });
        document.body.appendChild(btn);
        return btn;
      });

      buttons.forEach((btn) => highlighter.addHighlight(btn));

      highlighter.cleanup();

      // After cleanup, clicking should not trigger handler
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(buttons[0], "click");

      expect(handleClick).not.toHaveBeenCalled();

      buttons.forEach((btn) => btn.remove());
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
      const customHighlighter = new ElementHighlighter(new EventBus(), vi.fn(), {
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

      expect(() => {
        customHighlighter.addHighlight(button);
        customHighlighter.cleanup();
      }).not.toThrow();

      button.remove();
    });

    it("should respect debug option", () => {
      const debugHighlighter = new ElementHighlighter(new EventBus(), vi.fn(), {
        debug: true,
      });

      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
      document.body.appendChild(button);

      expect(() => {
        debugHighlighter.addHighlight(button);
        debugHighlighter.cleanup();
      }).not.toThrow();

      button.remove();
    });
  });

  describe("Multiple elements", () => {
    it("should handle multiple highlighted elements", () => {
      const elements = Array.from({ length: 10 }, (_, i) => {
        const div = document.createElement("div");
        div.textContent = `Element ${i}`;
        mockBoundingClientRect(div, { top: i * 50, left: 0, width: 100, height: 40 });
        document.body.appendChild(div);
        return div;
      });

      elements.forEach((el) => highlighter.addHighlight(el));

      simulateKeyEvent("keydown", "Alt");

      // Hover and click different elements
      simulateMouseEvent(elements[0], "mouseover");
      simulateMouseEvent(elements[0], "click");

      expect(handleClick).toHaveBeenCalledWith(elements[0]);

      simulateMouseEvent(elements[5], "mouseover");
      simulateMouseEvent(elements[5], "click");

      expect(handleClick).toHaveBeenCalledWith(elements[5]);

      simulateKeyEvent("keyup", "Alt");
      elements.forEach((el) => el.remove());
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
      button.remove();
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
      button.remove();
    });

    it("should start overlay with opacity 0 for fade-in", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);

      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      expect(overlay).not.toBeNull();
      expect(overlay!.style.transition).toContain("opacity");

      simulateKeyEvent("keyup", "Alt");
      button.remove();
    });
  });

  describe("Tooltip", () => {
    const getTooltip = (): HTMLDivElement | null => {
      return (
        (Array.from(document.body.querySelectorAll("div")).find((node) => {
          return (
            node.style.position === "absolute" &&
            node.style.fontSize === "11px" &&
            node.style.pointerEvents === "none" &&
            node.style.whiteSpace === "nowrap"
          );
        }) as HTMLDivElement | undefined) ?? null
      );
    };

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

      const tooltip = getTooltip();
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toBe("greeting (common)");

      simulateKeyEvent("keyup", "Alt");
      button.remove();
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

      const tooltip = getTooltip();
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain("(+1)");

      simulateKeyEvent("keyup", "Alt");
      button.remove();
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
      expect(getTooltip()).not.toBeNull();

      simulateKeyEvent("keyup", "Alt");
      expect(getTooltip()).toBeNull();

      button.remove();
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
      expect(getTooltip()).toBeNull();

      simulateKeyEvent("keyup", "Alt");
      button.remove();
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
      host.remove();
    });
  });
});
