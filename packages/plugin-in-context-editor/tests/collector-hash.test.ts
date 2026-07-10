import { describe, it, expect } from "vitest";
import { computeObservationHash, HASH_FN_VERSION } from "../src/collector/hash";
import { computeObservationHash as computeCanonicalHash } from "../src/collector/hash/observation-hash";
import type { ConstraintSignals, NeighborCandidate } from "../src/collector/types";

function makeConstraints(overrides: Partial<ConstraintSignals["hard"]> = {}): ConstraintSignals {
  return {
    hard: { mustBeShort: false, singleLine: false, widthBucket: "medium", ...overrides },
    soft: { likelyTruncated: false, visuallyCompact: false, visualProminence: "medium" },
  };
}

function makeNeighbor(overrides: Partial<NeighborCandidate> = {}): NeighborCandidate {
  return {
    namespace: "ns",
    key: "heading.title",
    semanticRole: "heading",
    hasAriaLabel: false,
    distance: 40,
    relativePosition: "above",
    containerType: "form",
    sameContainerAs: "form",
    readingOrderIndex: 0,
    ...overrides,
  };
}

describe("collector/hash", () => {
  it("HASH_FN_VERSION matches the canonical cross-repo spec", () => {
    expect(HASH_FN_VERSION).toBe(1);
  });

  it("is stable under jittered geometry (distance/rect changes, same top-K identity)", () => {
    const neighborsA = [makeNeighbor({ distance: 40 })];
    const neighborsB = [makeNeighbor({ distance: 41 })]; // 1px jitter, same relativePosition/container

    const hashA = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: neighborsA,
    });
    const hashB = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: neighborsB,
    });

    expect(hashA).toBe(hashB);
  });

  it("is stable under neighbor-array reorder (set is canonicalized before hashing)", () => {
    const first = makeNeighbor({ namespace: "ns", key: "a", readingOrderIndex: 0 });
    const second = makeNeighbor({ namespace: "ns", key: "b", readingOrderIndex: 1 });

    const hashForward = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [first, second],
    });
    const hashReversed = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [second, first],
    });

    expect(hashForward).toBe(hashReversed);
  });

  it("changes when a translation-affecting field changes (uiType)", () => {
    const neighbors = [makeNeighbor()];
    const hashA = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors,
    });
    const hashB = computeObservationHash({
      uiType: "primary-button",
      translationRole: "imperative-verb",
      constraints: makeConstraints(),
      neighbors,
    });

    expect(hashA).not.toBe(hashB);
  });

  it("changes when the hard constraint bucket changes", () => {
    const neighbors = [makeNeighbor()];
    const hashA = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints({ widthBucket: "tiny", mustBeShort: true }),
      neighbors,
    });
    const hashB = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints({ widthBucket: "full", mustBeShort: false }),
      neighbors,
    });

    expect(hashA).not.toBe(hashB);
  });

  it("canonical sort compares namespace first, then key, tying on identical tuples", () => {
    // Different namespace, same key -> namespace comparator branch.
    const byNamespace = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [
        makeNeighbor({ namespace: "b", key: "same" }),
        makeNeighbor({ namespace: "a", key: "same" }),
      ],
    });
    const byNamespaceReordered = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [
        makeNeighbor({ namespace: "a", key: "same" }),
        makeNeighbor({ namespace: "b", key: "same" }),
      ],
    });
    expect(byNamespace).toBe(byNamespaceReordered);

    // Identical (namespace,key) tuple appearing twice -> the tie ("equal") branch.
    const withTie = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [
        makeNeighbor({ namespace: "ns", key: "dup", relativePosition: "above" }),
        makeNeighbor({ namespace: "ns", key: "dup", relativePosition: "above" }),
      ],
    });
    expect(typeof withTie).toBe("string");
  });

  it("changes when the neighbor SET identity changes (different key)", () => {
    const hashA = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [makeNeighbor({ key: "a" })],
    });
    const hashB = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [makeNeighbor({ key: "different" })],
    });

    expect(hashA).not.toBe(hashB);
  });

  it("does not change when only readingOrderIndex/distance change beyond top-K selection but the selected SET is identical", () => {
    // Both neighbors fit within the canonical top-8 either way — only their
    // internal ordering metadata differs, not their canonical identity.
    const neighborsA = [
      makeNeighbor({ key: "a", readingOrderIndex: 0, distance: 10 }),
      makeNeighbor({ key: "b", readingOrderIndex: 1, distance: 20 }),
    ];
    const neighborsB = [
      makeNeighbor({ key: "a", readingOrderIndex: 5, distance: 999 }),
      makeNeighbor({ key: "b", readingOrderIndex: 6, distance: 998 }),
    ];

    const hashA = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: neighborsA,
    });
    const hashB = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: neighborsB,
    });

    expect(hashA).toBe(hashB);
  });

  it("adapts faithfully to the canonical function — matches calling it directly with the mapped shape", () => {
    const neighbors: NeighborCandidate[] = [
      makeNeighbor({
        namespace: "common",
        key: "checkout.title",
        relativePosition: "above",
        sameContainerAs: "dialog",
        readingOrderIndex: 0,
        distance: 40,
      }),
      makeNeighbor({
        namespace: "common",
        key: "checkout.cancel",
        relativePosition: "left",
        sameContainerAs: "dialog",
        readingOrderIndex: 1,
        distance: 60,
      }),
    ];
    const constraints = makeConstraints({
      widthBucket: "small",
      mustBeShort: true,
      singleLine: true,
    });

    const viaAdapter = computeObservationHash({
      uiType: "primary-button",
      translationRole: "imperative-verb",
      constraints,
      neighbors,
    });

    const viaCanonical = computeCanonicalHash({
      uiType: "primary-button",
      translationRole: "imperative-verb",
      mustBeShort: constraints.hard.mustBeShort,
      singleLine: constraints.hard.singleLine,
      widthBucket: constraints.hard.widthBucket,
      neighbors: neighbors.map((n) => ({
        namespace: n.namespace,
        key: n.key,
        relativePosition: n.relativePosition,
        sameContainerAs: n.sameContainerAs,
        readingOrderIndex: n.readingOrderIndex,
        distance: n.distance,
      })),
    });

    expect(viaAdapter).toBe(viaCanonical);
    // Matches the "primary-button-with-neighbors" golden vector exactly.
    expect(viaAdapter).toBe("687e589ddb606fc0bd7a07284be11bbaa4d5a4d22c562f8adf87d92833a4610a");
  });
});
