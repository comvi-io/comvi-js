import { describe, it, expect, afterEach } from "vitest";
import { extractConstraintSignals } from "../src/collector/signals";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";

describe("collector/signals — extractConstraintSignals", () => {
  afterEach(() => {
    cleanupDOM();
  });

  describe("extractConstraintSignals", () => {
    it("buckets a narrow, nowrap element as mustBeShort/singleLine/tiny", () => {
      const span = document.createElement("span");
      span.style.whiteSpace = "nowrap";
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      document.body.appendChild(span);
      mockBoundingClientRect(span, {
        width: 60,
        height: 16,
        top: 0,
        left: 0,
        right: 60,
        bottom: 16,
      });

      const constraints = extractConstraintSignals(span, span.getBoundingClientRect());

      expect(constraints.hard.widthBucket).toBe("tiny");
      expect(constraints.hard.mustBeShort).toBe(true);
      expect(constraints.hard.singleLine).toBe(true);
    });

    it("buckets a wide element as full width, not truncated", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, {
        width: 800,
        height: 40,
        top: 0,
        left: 0,
        right: 800,
        bottom: 40,
      });

      const constraints = extractConstraintSignals(div, div.getBoundingClientRect());

      expect(constraints.hard.widthBucket).toBe("full");
      expect(constraints.hard.mustBeShort).toBe(false);
    });

    it("buckets a zero-width element as tiny and mustBeShort", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });

      const constraints = extractConstraintSignals(div, div.getBoundingClientRect());

      expect(constraints.hard.widthBucket).toBe("tiny");
      expect(constraints.hard.mustBeShort).toBe(true);
    });

    it("flags likelyTruncated for a clipped, wrapping element and clears it once nowrap is set", () => {
      const wrapping = document.createElement("div");
      wrapping.style.overflow = "hidden";
      const clamped = document.createElement("div");
      clamped.style.overflow = "hidden";
      clamped.style.whiteSpace = "nowrap";
      document.body.append(wrapping, clamped);
      const rect = { width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40 };
      mockBoundingClientRect(wrapping, rect);
      mockBoundingClientRect(clamped, rect);

      const wrappingSoft = extractConstraintSignals(
        wrapping,
        wrapping.getBoundingClientRect(),
      ).soft;
      const clampedSoft = extractConstraintSignals(clamped, clamped.getBoundingClientRect()).soft;

      expect(wrappingSoft).toEqual({
        likelyTruncated: true,
        visuallyCompact: true,
        visualProminence: "medium",
      });
      expect(clampedSoft.likelyTruncated).toBe(false);
    });
  });

  describe("extractConstraintSignals() — width buckets", () => {
    it.each([
      [79, "tiny"],
      [80, "small"],
      [159, "small"],
      [160, "medium"],
      [319, "medium"],
      [320, "large"],
      [639, "large"],
      [640, "full"],
    ])("width %dpx → widthBucket %s", (width, expected) => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, { width, height: 20, top: 0, left: 0, right: width, bottom: 20 });

      expect(extractConstraintSignals(div, div.getBoundingClientRect()).hard.widthBucket).toBe(
        expected,
      );
    });

    it.each([
      [60, true, false],
      [100, false, true],
      [200, false, true],
      [400, false, false],
      [800, false, false],
    ])("width %dpx → mustBeShort %s, visuallyCompact %s", (width, mustBeShort, visuallyCompact) => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, {
        width,
        height: 20,
        top: 0,
        left: 0,
        right: width,
        bottom: 20,
      });

      const constraints = extractConstraintSignals(div, div.getBoundingClientRect());

      expect(constraints.hard.mustBeShort).toBe(mustBeShort);
      expect(constraints.soft.visuallyCompact).toBe(visuallyCompact);
    });
  });

  describe("extractConstraintSignals() — truncation and line breaking", () => {
    function wideElement(tag: string, styles: Partial<CSSStyleDeclaration>): Element {
      const element = document.createElement(tag);
      Object.assign(element.style, styles);
      document.body.appendChild(element);
      mockBoundingClientRect(element, {
        width: 200,
        height: 20,
        top: 0,
        left: 0,
        right: 200,
        bottom: 20,
      });
      return element;
    }

    it("clipping plus nowrap makes a wide element hard-truncated", () => {
      const element = wideElement("span", { overflow: "hidden", whiteSpace: "nowrap" });

      const constraints = extractConstraintSignals(element, element.getBoundingClientRect());

      expect(constraints.hard.mustBeShort).toBe(true);
      expect(constraints.hard.singleLine).toBe(true);
      expect(constraints.soft.likelyTruncated).toBe(false);
    });

    it("an ellipsis plus nowrap makes a wide element hard-truncated without overflow hidden", () => {
      const element = wideElement("span", { textOverflow: "ellipsis", whiteSpace: "nowrap" });

      expect(
        extractConstraintSignals(element, element.getBoundingClientRect()).hard.mustBeShort,
      ).toBe(true);
    });

    it("clipping without nowrap is only a soft truncation hint", () => {
      const element = wideElement("span", { overflow: "hidden" });

      const constraints = extractConstraintSignals(element, element.getBoundingClientRect());

      expect(constraints.hard.mustBeShort).toBe(false);
      expect(constraints.hard.singleLine).toBe(false);
      expect(constraints.soft.likelyTruncated).toBe(true);
    });

    it("an input is single line even when nothing sets nowrap", () => {
      const element = wideElement("input", {});

      expect(
        extractConstraintSignals(element, element.getBoundingClientRect()).hard.singleLine,
      ).toBe(true);
    });
  });

  describe("extractConstraintSignals() — visual prominence", () => {
    it.each([
      [24, "high"],
      [20, "high"],
      [19, "medium"],
      [14, "medium"],
      [13, "low"],
      [10, "low"],
    ])("font-size %dpx → visualProminence %s", (fontSize, expected) => {
      const span = document.createElement("span");
      span.style.fontSize = `${fontSize}px`;
      document.body.appendChild(span);
      mockBoundingClientRect(span, {
        width: 200,
        height: 20,
        top: 0,
        left: 0,
        right: 200,
        bottom: 20,
      });

      expect(
        extractConstraintSignals(span, span.getBoundingClientRect()).soft.visualProminence,
      ).toBe(expected);
    });
  });
});
