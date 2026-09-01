/**
 * The default overlay paint lives in src/config/highlight.ts and is only
 * observable through the element the highlighter renders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementHighlighter } from "../src/ElementHighlighter";
import { EventBus } from "../src/EventBus";
import {
  cleanupDOM,
  getActiveOverlay,
  mockBoundingClientRect,
  simulateKeyEvent,
  simulateMouseEvent,
} from "./helpers";

describe("ElementHighlighter default highlight style", () => {
  let highlighter: ElementHighlighter;

  beforeEach(() => {
    highlighter = new ElementHighlighter(new EventBus(), vi.fn());
  });

  afterEach(() => {
    simulateKeyEvent("keyup", "Alt");
    highlighter.cleanup();
    cleanupDOM();
  });

  it("paints the overlay with the default amber border and translucent fill", () => {
    const button = document.createElement("button");
    mockBoundingClientRect(button, { top: 0, left: 0, width: 100, height: 30 });
    document.body.appendChild(button);
    highlighter.addHighlight(button);

    simulateKeyEvent("keydown", "Alt");
    simulateMouseEvent(button, "mouseover");

    const overlay = getActiveOverlay();
    expect(overlay?.style.border).toBe("2px solid #D97706");
    expect(overlay?.style.backgroundColor).toBe("rgba(217, 119, 6, 0.12)");
  });
});
