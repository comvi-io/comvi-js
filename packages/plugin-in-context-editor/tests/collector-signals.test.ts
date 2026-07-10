import { describe, it, expect, afterEach } from "vitest";
import {
  buildNeighborCandidates,
  extractConstraintSignals,
  extractSemanticSignals,
} from "../src/collector/signals";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";
import type { ElementWithMeta, SemanticSignals } from "../src/collector/types";

function withMeta(
  element: Element,
  namespace: string,
  key: string,
  rect: Partial<DOMRect>,
  readingOrderIndex = 0,
): ElementWithMeta & { semantic: SemanticSignals } {
  mockBoundingClientRect(element, rect);
  const r = element.getBoundingClientRect();
  return {
    element,
    namespace,
    key,
    rect: r,
    centerPoint: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    readingOrderIndex,
    semantic: extractSemanticSignals(element),
  };
}

describe("collector/signals", () => {
  afterEach(() => {
    cleanupDOM();
  });

  describe("extractSemanticSignals — no rendered text ever leaves (RC4)", () => {
    it("resolves button role and never carries aria-label text, only presence", () => {
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Delete my account permanently, user@example.com");
      document.body.appendChild(button);

      const signals = extractSemanticSignals(button);

      expect(signals.semanticRole).toBe("button");
      expect(signals.hasAriaLabel).toBe(true);
      expect(JSON.stringify(signals)).not.toContain("user@example.com");
      expect(JSON.stringify(signals)).not.toContain("Delete my account");
    });

    it("container title becomes a boolean, never the heading text", () => {
      const dialog = document.createElement("dialog");
      const heading = document.createElement("h2");
      heading.textContent = "Confirm Jane Doe's subscription cancellation";
      dialog.appendChild(heading);
      const button = document.createElement("button");
      dialog.appendChild(button);
      document.body.appendChild(dialog);

      const signals = extractSemanticSignals(button);
      const containerEntry = signals.ancestry.find((a) => a.hasTitle);

      expect(containerEntry).toBeDefined();
      expect(JSON.stringify(signals)).not.toContain("Jane Doe");
    });

    it("stays unknown for a plain div with no semantic markers (never scanned for its own text)", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      const signals = extractSemanticSignals(div);
      expect(signals.semanticRole).toBe("unknown");
    });

    it("falls back to body-text for a stop-tag with no matching switch case and no cursor pointer", () => {
      // `legend`/`summary`/`th` are semantic stop-tags without an explicit
      // inferSemanticRole() case — they fall through to the body-text default.
      const legend = document.createElement("legend");
      document.body.appendChild(legend);
      const signals = extractSemanticSignals(legend);
      expect(signals.semanticRole).toBe("body-text");
    });
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
  });

  describe("buildNeighborCandidates — client-side drop filter (RC4/2g)", () => {
    it("never includes rawText, only length, and only {namespace,key} refs", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 100,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 120,
      });
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", {
        top: 70,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 90,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ namespace: "ns", key: "neighbor.key" });
      // B1: the wire NeighborRef carries exactly {namespace, key, semanticRole,
      // relativePosition, containerType, sameContainerAs, distance,
      // readingOrderIndex} — no rawText, no textLength, no ariaRole/hasAriaLabel.
      expect(candidates[0]).not.toHaveProperty("rawText");
      expect(candidates[0]).not.toHaveProperty("textLength");
      expect(candidates[0]).not.toHaveProperty("ariaRole");
      expect(candidates[0]).not.toHaveProperty("hasAriaLabel");
      expect(Object.keys(candidates[0]!).sort()).toEqual(
        [
          "namespace",
          "key",
          "semanticRole",
          "relativePosition",
          "containerType",
          "sameContainerAs",
          "distance",
          "readingOrderIndex",
        ].sort(),
      );
      expect(JSON.stringify(candidates)).not.toContain("Email address");
    });

    it("drops a neighbor whose local text looks like PII (phone-shaped digit run)", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      neighbor.textContent = "5551234567";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const neighborMeta = withMeta(neighbor, "ns", "pii.key", {
        top: 25,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 45,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toHaveLength(0);
    });

    it("drops generic-noise text unless the neighbor is a heading or label", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      neighbor.textContent = "OK";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const neighborMeta = withMeta(neighbor, "ns", "ok.key", {
        top: 25,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 45,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);
      expect(candidates).toHaveLength(0);
    });

    it("keeps a heading neighbor even if its text matches generic noise", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("h3");
      neighbor.textContent = "OK";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 30,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 50,
      });
      const neighborMeta = withMeta(neighbor, "ns", "heading.key", {
        top: 0,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 20,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.key).toBe("heading.key");
    });

    it("drops a neighbor beyond MAX_NEIGHBOR_DISTANCE and dedupes repeated (namespace,key)", () => {
      const target = document.createElement("button");
      const far = document.createElement("span");
      far.textContent = "far away";
      const dupeA = document.createElement("span");
      const dupeB = document.createElement("span");
      document.body.append(target, far, dupeA, dupeB);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const farMeta = withMeta(far, "ns", "far.key", {
        top: 2000,
        left: 2000,
        width: 30,
        height: 20,
        right: 2030,
        bottom: 2020,
      });
      const dupeAMeta = withMeta(dupeA, "ns", "dupe.key", {
        top: 25,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 45,
      });
      const dupeBMeta = withMeta(dupeB, "ns", "dupe.key", {
        top: 50,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 70,
      });

      const candidates = buildNeighborCandidates(targetMeta, [
        targetMeta,
        farMeta,
        dupeAMeta,
        dupeBMeta,
      ]);

      expect(candidates.map((c) => c.key)).toEqual(["dupe.key"]);
    });
  });
});
