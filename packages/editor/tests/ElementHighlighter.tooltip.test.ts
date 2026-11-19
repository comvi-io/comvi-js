import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ElementHighlighter } from "../src/ElementHighlighter";
import type { EventBus } from "../src/EventBus";
import { DEFAULT_HIGHLIGHT_Z_INDEX } from "../src/config/highlight";
import {
  cleanupDOM,
  simulateKeyEvent,
  simulateMouseEvent,
  mockBoundingClientRect,
  getActiveOverlay,
  getActiveTooltip,
  flushAnimationFrame,
} from "./helpers";
import {
  createHighlighterFixture,
  restorePageScroll,
  stubPageScroll,
  appendElement,
  registerKeysOn,
} from "./helpers/elementHighlighter";

describe("ElementHighlighter — key tooltip", () => {
  let highlighter: ElementHighlighter;
  let eventBus: EventBus;

  function registerKeys(element: Element, keys: Array<{ key: string; ns?: string }>): void {
    registerKeysOn(eventBus, element, keys);
  }

  beforeEach(() => {
    ({ highlighter, eventBus } = createHighlighterFixture());
  });

  afterEach(() => {
    highlighter.cleanup();
    cleanupDOM();
    restorePageScroll();
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

    it("one text node carrying two keys → the tooltip counts both", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 50, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);
      const text = document.createTextNode("HelloBye");
      button.appendChild(text);
      eventBus.emit("translationRegistered", button, {
        nodes: new Map([
          [
            text,
            {
              key: "hello",
              ns: "common",
              markers: [
                { key: "hello", ns: "common" },
                { key: "bye", ns: "common" },
              ],
            },
          ],
        ]),
      });

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");

      expect(getActiveTooltip()!.textContent).toBe("hello (common) (+1)");
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

    it("Alt released while a key tooltip shows → the tooltip is removed", () => {
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

    it("Alt+hover → the overlay and the tooltip start transparent with a 150ms opacity transition", () => {
      const button = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);
      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(button, "mouseover");

      const overlay = getActiveOverlay();
      const tooltip = getActiveTooltip();
      expect({
        opacity: [overlay?.style.opacity, tooltip?.style.opacity],
        transition: [overlay?.style.transition, tooltip?.style.transition],
      }).toEqual({
        opacity: ["0", "0"],
        transition: ["opacity 150ms ease-in-out", "opacity 150ms ease-in-out"],
      });
    });

    it("Alt+hover, next animation frame → the overlay and the tooltip fade in to opacity 1", async () => {
      const button = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      const overlay = getActiveOverlay();
      const tooltip = getActiveTooltip();

      await flushAnimationFrame();

      expect([overlay?.style.opacity, tooltip?.style.opacity]).toEqual(["1", "1"]);
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

    it("Alt+hover moves to a second element → one tooltip shows its key at its position, transparent until the next frame", async () => {
      const first = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      const second = appendElement({ top: 300, left: 10, width: 80, height: 20, bottom: 320 });
      registerKeys(first, [{ key: "greeting", ns: "common" }]);
      registerKeys(second, [{ key: "farewell", ns: "common" }]);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover");
      await flushAnimationFrame();

      simulateMouseEvent(second, "mouseover");

      const tooltip = getActiveTooltip();
      expect({
        text: tooltip?.textContent,
        opacity: tooltip?.style.opacity,
        top: tooltip?.style.top,
        overlayAndTooltipOnly: document.body.querySelectorAll("div").length,
      }).toEqual({
        text: "farewell (common)",
        opacity: "0",
        top: "266px",
        overlayAndTooltipOnly: 2,
      });
    });

    it("Alt+hover moves to a second element, next animation frame → its tooltip fades in", async () => {
      const first = appendElement({ top: 100, left: 60, width: 120, height: 40, bottom: 140 });
      const second = appendElement({ top: 300, left: 10, width: 80, height: 20, bottom: 320 });
      registerKeys(first, [{ key: "greeting", ns: "common" }]);
      registerKeys(second, [{ key: "farewell", ns: "common" }]);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(first, "mouseover");
      await flushAnimationFrame();
      simulateMouseEvent(second, "mouseover");
      const tooltip = getActiveTooltip();

      await flushAnimationFrame();

      expect(tooltip?.style.opacity).toBe("1");
    });
  });
});
