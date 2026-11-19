import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { ElementHighlighter } from "../src/ElementHighlighter";
import type { EventBus } from "../src/EventBus";
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

describe("ElementHighlighter — highlight overlay", () => {
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
    // Restored here, not at the end of a test: a failing assertion must not
    // leave fake timers installed for the tests that follow.
    vi.useRealTimers();
    highlighter.cleanup();
    cleanupDOM();
    restorePageScroll();
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
      }).toThrow("[@comvi/plugin-in-context-editor] Element cannot be null or undefined");
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

    it("removeHighlightFromElement on a never-highlighted element → does not throw", () => {
      const stranger = document.createElement("button");
      document.body.append(stranger);

      expect(() => highlighter.removeHighlightFromElement(stranger)).not.toThrow();
    });

    it("removeHighlightFromElement on a never-highlighted element → the highlighted one still answers Alt+click", () => {
      const highlighted = document.createElement("button");
      const stranger = document.createElement("button");
      mockBoundingClientRect(highlighted, { top: 0, left: 0, width: 100, height: 30 });
      document.body.append(highlighted, stranger);
      highlighter.addHighlight(highlighted);
      highlighter.removeHighlightFromElement(stranger);
      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(highlighted, "click");

      expect(handleClick).toHaveBeenCalledWith(highlighted);
      simulateKeyEvent("keyup", "Alt");
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
        vi.advanceTimersToNextFrame();

        expect(
          warn.mock.calls.filter(
            ([message]) =>
              message ===
              "[@comvi/plugin-in-context-editor] Cannot update position: element is detached from DOM",
          ),
        ).toHaveLength(expectedWarnings);
      },
    );
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

    it("Alt+hover → the overlay starts at opacity 0", () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");

      simulateMouseEvent(button, "mouseover");

      expect(getActiveOverlay()?.style.opacity).toBe("0");
      simulateKeyEvent("keyup", "Alt");
    });

    it("Alt+hover, next animation frame → the overlay fades in to opacity 1", async () => {
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 10, left: 10, width: 100, height: 30 });
      document.body.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      const overlay = getActiveOverlay();

      await flushAnimationFrame();

      expect(overlay?.style.opacity).toBe("1");
      simulateKeyEvent("keyup", "Alt");
    });
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

    it("inner container scrolls → the overlay follows on the next animation frame", () => {
      const scrollable = appendScrollable({ overflowY: "auto", overflowX: "hidden" });
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 0, width: 100, height: 30 });
      scrollable.appendChild(button);
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 80, left: 0, width: 100, height: 30 });

      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("80px");
    });

    it("window resizes → the overlay and tooltip move onto the element's new rect", () => {
      const button = appendElement({ top: 100, left: 10, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting" }]);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 150, left: 30, width: 60, height: 40, bottom: 190 });

      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersToNextFrame();

      expect({
        top: getActiveOverlay()!.style.top,
        left: getActiveOverlay()!.style.left,
        width: getActiveOverlay()!.style.width,
        tooltipTop: getActiveTooltip()!.style.top,
      }).toEqual({ top: "150px", left: "30px", width: "60px", tooltipTop: "116px" });
    });

    it("content inserted above the element, with no scroll or resize → the overlay moves on the next frame", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);
      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      vi.advanceTimersToNextFrame();

      const banner = document.createElement("div");
      document.body.insertBefore(banner, button);
      mockBoundingClientRect(button, { top: 260, left: 0, width: 100, height: 30 });
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("260px");
    });

    it.each([
      ["the overlay is dismissed", () => simulateKeyEvent("keyup", "Alt")],
      ["the highlighter is cleaned up", () => highlighter.cleanup()],
    ])(
      "%s → no animation frame stays queued and the element is no longer measured",
      (_condition, dismiss) => {
        const button = appendElement({ top: 100, left: 0, width: 100, height: 30 });
        highlighter.addHighlight(button);
        simulateKeyEvent("keydown", "Alt");
        simulateMouseEvent(button, "mouseover");
        vi.advanceTimersToNextFrame();
        const measure = vi.spyOn(button, "getBoundingClientRect");

        dismiss();
        vi.advanceTimersToNextFrame();
        vi.advanceTimersToNextFrame();

        expect({ queuedTimers: vi.getTimerCount(), measured: measure.mock.calls.length }).toEqual({
          queuedTimers: 0,
          measured: 0,
        });
      },
    );

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
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("20px");
    });

    it("element moves while a non-scrollable ancestor scrolls → the overlay still follows it", () => {
      const wrapper = appendScrollable({ overflowY: "hidden", overflowX: "hidden" });
      const button = document.createElement("button");
      mockBoundingClientRect(button, { top: 100, left: 0, width: 100, height: 30 });
      wrapper.appendChild(button);
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 20, left: 0, width: 100, height: 30 });
      wrapper.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("20px");
    });

    it("repositions the tooltip together with the overlay on page scroll", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 40, bottom: 140 });
      registerKeys(button, [{ key: "greeting", ns: "common" }]);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      mockBoundingClientRect(button, { top: 200, left: 0, width: 100, height: 40, bottom: 240 });
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("200px");
      expect(getActiveTooltip()!.style.top).toBe("166px");
    });

    it("hover moves to another element → movement of the previous one no longer moves the overlay", () => {
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
      mockBoundingClientRect(firstButton, { top: 50, left: 0, width: 100, height: 30 });
      first.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("200px");
    });

    it("overlay dismissed and shown on another element → the first element's movement is ignored", () => {
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
      mockBoundingClientRect(inside, { top: 10, left: 0, width: 100, height: 30 });
      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

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
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("20px");
    });

    it("hover passes over an element and moves on → that element's movement is ignored", () => {
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
      mockBoundingClientRect(inside, { top: 10, left: 0, width: 100, height: 30 });
      scrollable.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()!.style.top).toBe("400px");
    });

    it("drops a scroll update that lands after the overlay was dismissed", () => {
      const button = appendElement({ top: 100, left: 0, width: 100, height: 30 });
      highlighter.addHighlight(button);

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(button, "mouseover");
      window.dispatchEvent(new Event("scroll"));
      simulateKeyEvent("keyup", "Alt");
      vi.advanceTimersToNextFrame();

      expect(getActiveOverlay()).toBeNull();
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
      vi.advanceTimersToNextFrame();

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
