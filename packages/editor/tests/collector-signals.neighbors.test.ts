import { describe, it, expect, afterEach } from "vitest";
import { buildNeighborCandidates, MAX_NEIGHBOR_DISTANCE } from "../src/collector/signals";
import { cleanupDOM } from "./helpers";
import { withMeta, buildChain, boxAt } from "./helpers/collectorSignals";

describe("collector/signals — buildNeighborCandidates", () => {
  afterEach(() => {
    cleanupDOM();
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
      // The wire NeighborRef carries exactly {namespace, key, semanticRole,
      // relativePosition, containerType, sameContainerAs, distance,
      // readingOrderIndex} — no rawText, no textLength, no ariaRole/hasAriaLabel.
      expect(Object.keys(candidates[0]!).sort()).toEqual([
        "containerType",
        "distance",
        "key",
        "namespace",
        "readingOrderIndex",
        "relativePosition",
        "sameContainerAs",
        "semanticRole",
      ]);
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

      expect(candidates.map((c) => c.key)).toEqual(["heading.key"]);
    });

    it("drops a neighbor beyond MAX_NEIGHBOR_DISTANCE", () => {
      const target = document.createElement("button");
      const far = document.createElement("span");
      far.textContent = "far away";
      document.body.append(target, far);

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

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, farMeta]);

      expect(candidates).toEqual([]);
    });

    it("dedupes repeated (namespace,key) neighbors down to a single candidate", () => {
      const target = document.createElement("button");
      const dupeA = document.createElement("span");
      const dupeB = document.createElement("span");
      document.body.append(target, dupeA, dupeB);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
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

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, dupeAMeta, dupeBMeta]);

      expect(candidates.map((c) => c.key)).toEqual(["dupe.key"]);
    });
  });

  describe("buildNeighborCandidates() — text drop filter", () => {
    it.each([
      { text: "Email address", included: true },
      { text: "2 items", included: true },
      { text: "Row 3", included: true },
      { text: "$5.00", included: true },
      { text: "3rd", included: true },
      { text: "Call 555 123 4567", included: true },
      { text: "Click ok", included: true },
      { text: "OK to proceed", included: true },
      { text: "x".repeat(80), included: true },
      { text: "ok", included: false },
      { text: "  ok  ", included: false },
      { text: "+1 555 0100", included: false },
      { text: "555 0100 ext 12", included: false },
      { text: "order 12345678", included: false },
      { text: "x".repeat(81), included: false },
    ])("neighbour text $text → included: $included", ({ text, included }) => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      neighbor.textContent = text;
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates.map((c) => c.key)).toEqual(included ? ["neighbor.key"] : []);
    });

    it("keeps a label neighbour whose text is generic noise", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Next";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "label.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates.map((c) => c.key)).toEqual(["label.key"]);
    });

    it("drops a heading neighbour whose text is mostly numeric", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("h3");
      neighbor.textContent = "1 234,50";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "amount.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toEqual([]);
    });
  });

  describe("buildNeighborCandidates() — geometry", () => {
    function neighborAt(dx: number, dy: number) {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      document.body.append(target, neighbor);

      return {
        targetMeta: withMeta(target, "ns", "target.key", boxAt(200, 200)),
        neighborMeta: withMeta(neighbor, "ns", "neighbor.key", boxAt(200 + dx, 200 + dy)),
      };
    }

    it.each([
      { dx: 100, dy: 0, expected: "right" },
      { dx: -100, dy: 0, expected: "left" },
      { dx: 0, dy: 100, expected: "below" },
      { dx: 0, dy: -100, expected: "above" },
      { dx: 100, dy: 30, expected: "below" },
      { dx: 20, dy: 20, expected: "below" },
      { dx: 20, dy: -20, expected: "above" },
      { dx: 0, dy: 0, expected: "above" },
    ])("neighbour offset ($dx, $dy) → relativePosition $expected", ({ dx, dy, expected }) => {
      const { targetMeta, neighborMeta } = neighborAt(dx, dy);

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates[0]).toMatchObject({ relativePosition: expected });
    });

    it("keeps a neighbour exactly at MAX_NEIGHBOR_DISTANCE", () => {
      const { targetMeta, neighborMeta } = neighborAt(MAX_NEIGHBOR_DISTANCE, 0);

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ key: "neighbor.key", distance: MAX_NEIGHBOR_DISTANCE }]);
    });

    it("orders candidates by distance, nearest first", () => {
      const target = document.createElement("button");
      const far = document.createElement("span");
      const near = document.createElement("span");
      const middle = document.createElement("span");
      document.body.append(target, far, near, middle);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const all = [
        withMeta(far, "ns", "far.key", boxAt(0, 300)),
        withMeta(near, "ns", "near.key", boxAt(0, 100)),
        withMeta(middle, "ns", "middle.key", boxAt(0, 200)),
      ];

      const candidates = buildNeighborCandidates(targetMeta, all);

      expect(candidates.map((c) => c.key)).toEqual(["near.key", "middle.key", "far.key"]);
    });

    it("caps the payload at MAX_NEIGHBORS_PER_OBSERVATION nearest neighbours", () => {
      const target = document.createElement("button");
      document.body.appendChild(target);
      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const all = Array.from({ length: 13 }, (_, i) => {
        const neighbor = document.createElement("span");
        document.body.appendChild(neighbor);
        return withMeta(neighbor, "ns", `n${i + 1}.key`, boxAt(0, (i + 1) * 20));
      });

      const candidates = buildNeighborCandidates(targetMeta, all);

      expect(candidates.map((c) => c.key)).toEqual([
        "n1.key",
        "n2.key",
        "n3.key",
        "n4.key",
        "n5.key",
        "n6.key",
        "n7.key",
        "n8.key",
        "n9.key",
        "n10.key",
        "n11.key",
        "n12.key",
      ]);
    });

    it("keeps a neighbour that reuses the target key under another namespace", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "checkout", "title", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "legal", "title", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ namespace: "legal", key: "title" }]);
    });

    it("separates namespace from key so that neighbours cannot collide across namespaces", () => {
      const target = document.createElement("button");
      const first = document.createElement("span");
      const second = document.createElement("span");
      document.body.append(target, first, second);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const all = [
        withMeta(first, "home", "nav.title", boxAt(0, 40)),
        withMeta(second, "homenav", ".title", boxAt(0, 80)),
      ];

      const candidates = buildNeighborCandidates(targetMeta, all);

      expect(candidates.map((c) => `${c.namespace}/${c.key}`)).toEqual([
        "home/nav.title",
        "homenav/.title",
      ]);
    });
  });

  describe("buildNeighborCandidates() — container signals", () => {
    // <fieldset>, not <form>: happy-dom's HTMLFormElement.contains() always
    // returns false, which would fake a passing sameContainerAs === null.
    it("reports the nearest container of the neighbour and the container it shares with the target", () => {
      const fieldset = document.createElement("fieldset");
      const row = document.createElement("div");
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      row.append(target, neighbor);
      fieldset.appendChild(row);
      document.body.appendChild(fieldset);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([
        { containerType: "fieldset", sameContainerAs: "fieldset" },
      ]);
    });

    it("reports no shared container when the neighbour sits outside the target container", () => {
      const fieldset = document.createElement("fieldset");
      const row = document.createElement("div");
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      row.appendChild(target);
      fieldset.appendChild(row);
      document.body.append(fieldset, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ containerType: "generic", sameContainerAs: null }]);
    });

    it("ignores a container more than five levels above the neighbour", () => {
      const row = buildChain("fieldset", "div", "div", "div", "div", "div");
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      row.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ containerType: "generic", sameContainerAs: null }]);
    });
  });
});
