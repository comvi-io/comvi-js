import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { ElementHighlighter } from "../src/ElementHighlighter";
import { EventBus } from "../src/EventBus";
import type { NodeData } from "../src/types/translation";
import { SCROLL_DEBOUNCE_DELAY, DEFAULT_HIGHLIGHT_Z_INDEX } from "../src/config/highlight";
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
  let handleClick: Mock<(element: Element) => void>;
  let eventBus: EventBus;

  beforeEach(() => {
    handleClick = vi.fn<(element: Element) => void>();
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

describe("ElementHighlighter", () => {
  let highlighter: ElementHighlighter;
  let handleClick: Mock<(element: Element) => void>;
  let eventBus: EventBus;

  const scrollDescriptors = {
    x: Object.getOwnPropertyDescriptor(window, "scrollX"),
    y: Object.getOwnPropertyDescriptor(window, "scrollY"),
  };

  function stubPageScroll(x: number, y: number): void {
    Object.defineProperty(window, "scrollX", { value: x, configurable: true });
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  }

  function restorePageScroll(): void {
    for (const [axis, descriptor] of [
      ["scrollX", scrollDescriptors.x],
      ["scrollY", scrollDescriptors.y],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(window, axis, descriptor);
      } else {
        delete (window as unknown as Record<string, unknown>)[axis];
      }
    }
  }

  function appendElement(rect: Partial<DOMRect>, tagName = "button"): HTMLElement {
    const element = document.createElement(tagName);
    mockBoundingClientRect(element, rect);
    document.body.appendChild(element);
    return element;
  }

  function registerKeys(element: Element, keys: Array<{ key: string; ns?: string }>): void {
    // `NodeData.ns` is a required string, and the highlighter reads a falsy one
    // as "no namespace", so an omitted namespace stands in as the empty string.
    const nodes = new Map<Node | Attr, NodeData>(
      keys.map((entry) => [
        document.createTextNode(entry.key),
        { key: entry.key, ns: entry.ns ?? "" },
      ]),
    );
    eventBus.emit("translationRegistered", element, { nodes });
  }

  beforeEach(() => {
    handleClick = vi.fn<(element: Element) => void>();
    eventBus = new EventBus();
    highlighter = new ElementHighlighter(eventBus, handleClick);
  });

  afterEach(() => {
    highlighter.cleanup();
    cleanupDOM();
    restorePageScroll();
  });

  describe("overlay geometry", () => {
    it("positions the overlay over the element's viewport rect offset by the page scroll", () => {
      stubPageScroll(15, 40);
      const button = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      expect(overlay).not.toBeNull();
      expect({
        top: overlay!.style.top,
        left: overlay!.style.left,
        width: overlay!.style.width,
        height: overlay!.style.height,
      }).toEqual({ top: "140px", left: "75px", width: "120px", height: "40px" });
    });

    it("moves the single overlay onto the newly hovered element", () => {
      const first = appendElement({ top: 10, left: 10, width: 100, height: 30, bottom: 40 });
      const second = appendElement({ top: 200, left: 80, width: 60, height: 20, bottom: 220 });
      highlighter.addHighlight(first);
      highlighter.addHighlight(second);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover");
      const overlay = getActiveOverlay();
      simulateMouseEvent(second, "mouseover");

      expect(getActiveOverlay()).toBe(overlay);
      expect(overlay!.style.top).toBe("200px");
      expect(overlay!.style.left).toBe("80px");
    });
  });

  describe("tooltip presentation", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      { placement: "above", top: 100, bottom: 140, expectedTop: "106px" },
      { placement: "below", top: 28, bottom: 68, expectedTop: "114px" },
      { placement: "above at the exact fit boundary", top: 34, bottom: 74, expectedTop: "40px" },
    ])(
      "places the tooltip $placement an element whose top is $top",
      ({ top, bottom, expectedTop }) => {
        stubPageScroll(15, 40);
        const button = appendElement({ top, left: 60, width: 120, height: 40, bottom });
        registerKeys(button, [{ key: "greeting", ns: "common" }]);

        simulateKeyEvent("keydown", "Alt");
        simulateMouseEvent(button, "mouseover");

        const tooltip = getActiveTooltip();
        expect(tooltip).not.toBeNull();
        expect({ top: tooltip!.style.top, left: tooltip!.style.left }).toEqual({
          top: expectedTop,
          left: "75px",
        });
      },
    );

    it("styles the tooltip as a dark angular chip one layer above the overlay", () => {
      const button = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const tooltip = getActiveTooltip();
      expect(tooltip).not.toBeNull();
      expect({
        backgroundColor: tooltip!.style.backgroundColor,
        color: tooltip!.style.color,
        border: tooltip!.style.border,
        fontFamily: tooltip!.style.fontFamily,
        letterSpacing: tooltip!.style.letterSpacing,
        padding: tooltip!.style.padding,
        borderRadius: tooltip!.style.borderRadius,
        zIndex: tooltip!.style.zIndex,
      }).toEqual({
        backgroundColor: "#0E0D0C",
        color: "#F4EFE0",
        border: "1px solid #2A2725",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.05em",
        padding: "4px 8px",
        borderRadius: "0px",
        zIndex: String(DEFAULT_HIGHLIGHT_Z_INDEX + 1),
      });
    });

    it("fades the overlay and the tooltip in on the next animation frame", async () => {
      const button = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      const tooltip = getActiveTooltip();
      expect([overlay!.style.opacity, tooltip!.style.opacity]).toEqual(["0", "0"]);
      expect([overlay!.style.transition, tooltip!.style.transition]).toEqual([
        "opacity 150ms ease-in-out",
        "opacity 150ms ease-in-out",
      ]);

      await flushAnimationFrame();

      expect([overlay!.style.opacity, tooltip!.style.opacity]).toEqual(["1", "1"]);
    });

    it("leaves nothing behind when the modifier is released before the fade-in frame", () => {
      vi.useFakeTimers();
      const button = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      simulateKeyEvent("keyup", "Alt");
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()).toBeNull();
      expect(getActiveTooltip()).toBeNull();
    });

    it("leaves nothing behind when the modifier is released before a second element's fade-in frame", () => {
      vi.useFakeTimers();
      const first = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      const second = appendElement({ top: 300, left: 10, width: 80, height: 20, bottom: 320 });
      registerKeys(first, [{ key: "greeting", ns: "common" }]);
      registerKeys(second, [{ key: "farewell", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover");
      vi.advanceTimersToNextFrame();
      simulateMouseEvent(second, "mouseover");
      simulateKeyEvent("keyup", "Alt");
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()).toBeNull();
      expect(getActiveTooltip()).toBeNull();
    });

    it("replaces the tooltip with the newly hovered element's key", async () => {
      const first = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      const second = appendElement({ top: 300, left: 10, width: 80, height: 20, bottom: 320 });
      registerKeys(first, [{ key: "greeting", ns: "common" }]);
      registerKeys(second, [{ key: "farewell", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover");
      await flushAnimationFrame();
      simulateMouseEvent(second, "mouseover");

      const tooltip = getActiveTooltip();
      expect(tooltip!.textContent).toBe("farewell (common)");
      expect(tooltip!.style.opacity).toBe("0");
      expect(tooltip!.style.top).toBe("266px");
      expect(document.body.querySelectorAll("div").length).toBe(2);

      await flushAnimationFrame();

      expect(tooltip!.style.opacity).toBe("1");
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

  describe("ancestor lookup memoization", () => {
    it("resolves an element registered after a failed lookup — registering invalidates the cache", () => {
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "click");
      expect(handleClick).not.toHaveBeenCalled();

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "click");

      expect(handleClick.mock.calls).toEqual([[button]]);
    });

    it("stops resolving a child after its ancestor is unregistered — unregistering invalidates the cache", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      parent.appendChild(child);
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "click");
      expect(handleClick).toHaveBeenCalledWith(parent);

      highlighter.removeHighlightFromElement(parent);
      simulateMouseEvent(child, "click");

      expect(handleClick.mock.calls).toEqual([[parent]]);
    });

    it("keeps resolving a child moved out of its registered ancestor until registration changes", () => {
      const parent = appendElement({ top: 0, left: 0, width: 100, height: 30 }, "div");
      const child = document.createElement("span");
      parent.appendChild(child);
      highlighter.addHighlight(parent);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(child, "click");
      document.body.appendChild(child);
      simulateMouseEvent(child, "click");

      expect(handleClick.mock.calls).toEqual([[parent], [parent]]);
    });

    it("keeps ignoring a related target moved into a registered element until registration changes", () => {
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

      expect(getActiveOverlay()).toBeNull();
    });
  });

  describe("modifier handling", () => {
    it("shows the overlay when Alt is pressed while the pointer is already on the element", () => {
      const button = appendElement({ top: 40, left: 20, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateMouseEvent(button, "mouseover");
      expect(getActiveOverlay()).toBeNull();

      simulateKeyEvent("keydown", "Alt");

      expect(getActiveOverlay()!.style.top).toBe("40px");
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

  describe("scroll tracking", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function appendScrollable(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
      const scrollable = document.createElement("div");
      Object.assign(scrollable.style, styles);
      document.body.appendChild(scrollable);
      return scrollable;
    }

    it.each([
      { css: "overflow-y: auto", styles: { overflowY: "auto", overflowX: "hidden" } },
      { css: "overflow-y: scroll", styles: { overflowY: "scroll", overflowX: "hidden" } },
      { css: "overflow-x: auto", styles: { overflowX: "auto", overflowY: "hidden" } },
      { css: "overflow-x: scroll", styles: { overflowX: "scroll", overflowY: "hidden" } },
    ])("repositions the overlay when an ancestor with $css scrolls", ({ styles }) => {
      const scrollable = appendScrollable(styles);
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 0, width: 100, height: 30 });
      scrollable.appendChild(button);
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 20, left: 0, width: 100, height: 30 });
      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("20px");
    });

    it("ignores scroll on a non-scrollable ancestor", () => {
      const wrapper = appendScrollable({ overflowY: "hidden", overflowX: "hidden" });
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 0, width: 100, height: 30 });
      wrapper.appendChild(button);
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 20, left: 0, width: 100, height: 30 });
      wrapper.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("100px");
    });

    it("repositions the tooltip together with the overlay on page scroll", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 200, left: 0, width: 100, height: 40, bottom: 240 });
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("200px");
      expect(getActiveTooltip()!.style.top).toBe("166px");
    });

    it("stops following the previous scrollable ancestor once the hover moves away", () => {
      const first = appendScrollable({ overflowY: "auto", overflowX: "hidden" });
      const firstButton = document.createElement("button");
      mockBoundingClientRect(firstButton, { top: 100, left: 0, width: 100, height: 30 });
      first.appendChild(firstButton);
      const secondButton = appendElement({ top: 200, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(firstButton);
      highlighter.addHighlight(secondButton);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(firstButton, "mouseover");
      simulateMouseEvent(secondButton, "mouseover");
      mockBoundingClientRect(secondButton, { top: 50, left: 0, width: 100, height: 30 });
      first.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("200px");
    });

    it("stops following a scrollable ancestor once its overlay is dismissed", () => {
      const scrollable = appendScrollable({ overflowY: "auto", overflowX: "hidden" });
      const inside = document.createElement("button");
      mockBoundingClientRect(inside, { top: 100, left: 0, width: 100, height: 30 });
      scrollable.appendChild(inside);
      const outside = appendElement({ top: 300, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(inside);
      highlighter.addHighlight(outside);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(inside, "mouseover");
      simulateMouseEvent(inside, "mouseout");
      simulateMouseEvent(outside, "mouseover");
      mockBoundingClientRect(outside, { top: 10, left: 0, width: 100, height: 30 });
      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("300px");
    });

    it("follows the scrollable ancestor of an element the hover moves onto", () => {
      const plain = appendElement({ top: 300, left: 0, width: 100, height: 30 });
      const scrollable = appendScrollable({ overflowY: "auto", overflowX: "hidden" });
      const inside = document.createElement("button");
      mockBoundingClientRect(inside, { top: 100, left: 0, width: 100, height: 30 });
      scrollable.appendChild(inside);
      highlighter.addHighlight(plain);
      highlighter.addHighlight(inside);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(plain, "mouseover");
      simulateMouseEvent(inside, "mouseover");
      mockBoundingClientRect(inside, { top: 20, left: 0, width: 100, height: 30 });
      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("20px");
    });

    it("releases a scrollable ancestor picked up on a hover switch", () => {
      const plain = appendElement({ top: 300, left: 0, width: 100, height: 30 });
      const scrollable = appendScrollable({ overflowY: "auto", overflowX: "hidden" });
      const inside = document.createElement("button");
      mockBoundingClientRect(inside, { top: 100, left: 0, width: 100, height: 30 });
      scrollable.appendChild(inside);
      const last = appendElement({ top: 400, left: 0, width: 100, height: 30 });
      [plain, inside, last].forEach((element) => highlighter.addHighlight(element));

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(plain, "mouseover");
      simulateMouseEvent(inside, "mouseover");
      simulateMouseEvent(last, "mouseover");
      mockBoundingClientRect(last, { top: 10, left: 0, width: 100, height: 30 });
      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()!.style.top).toBe("400px");
    });

    it("drops a scroll update that lands after the overlay was dismissed", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      window.dispatchEvent(new Event("scroll"));
      simulateKeyEvent("keyup", "Alt");
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(getActiveOverlay()).toBeNull();
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

    it("forgets both the element and its keys on translationRemoved", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      eventBus.emit("translationRemoved", button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      expect(getActiveOverlay()).toBeNull();

      highlighter.addHighlight(button);
      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()).not.toBeNull();
      expect(getActiveTooltip()).toBeNull();
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

  describe("default options", () => {
    it("stays silent about a detached element when debug is not requested", () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const button = appendElement({ top: 0, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      button.remove();
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_DEBOUNCE_DELAY);

      expect(warn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
