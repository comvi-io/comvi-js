import { describe, it, expect } from "vitest";
import { computeObservationHash, HASH_FN_VERSION } from "../src/collector/hash";
import type { ConstraintSignals, NeighborCandidate } from "../src/collector/types";

function makeConstraints(
  hard: Partial<ConstraintSignals["hard"]> = {},
  soft: Partial<ConstraintSignals["soft"]> = {},
): ConstraintSignals {
  return {
    hard: { mustBeShort: false, singleLine: false, widthBucket: "medium", ...hard },
    soft: {
      likelyTruncated: false,
      visuallyCompact: false,
      visualProminence: "medium",
      ...soft,
    },
  };
}

function makeNeighbor(overrides: Partial<NeighborCandidate> = {}): NeighborCandidate {
  return {
    namespace: "ns",
    key: "heading.title",
    semanticRole: "heading",
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

  it("is invariant to a namespace-ordered reorder when the keys are equal", () => {
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
  });

  it("keeps a repeated (namespace,key) neighbour as a second entry rather than collapsing it", () => {
    const duplicate = makeNeighbor({ namespace: "ns", key: "dup", relativePosition: "above" });

    const withTie = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [duplicate, { ...duplicate }],
    });
    const withoutTie = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors: [duplicate],
    });

    expect(withTie).toBe("d6a66df04a8946d4b918f64a61170019a368733535d03cb54cd106d6d8b8b730");
    expect(withTie).not.toBe(withoutTie);
  });

  it("ignores the soft constraint signals, which never reach the hash input", () => {
    const neighbors = [makeNeighbor()];

    const neutral = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(),
      neighbors,
    });
    const softChanged = computeObservationHash({
      uiType: "form-label",
      translationRole: "field-label",
      constraints: makeConstraints(
        {},
        { likelyTruncated: true, visuallyCompact: true, visualProminence: "high" },
      ),
      neighbors,
    });

    expect(softChanged).toBe(neutral);
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

  it("matches the primary-button-with-neighbors golden vector", () => {
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

    const hash = computeObservationHash({
      uiType: "primary-button",
      translationRole: "imperative-verb",
      constraints: makeConstraints({
        widthBucket: "small",
        mustBeShort: true,
        singleLine: true,
      }),
      neighbors,
    });

    // The cross-repo "primary-button-with-neighbors" vector: the server derives
    // the same digest from the same observation, so this pins the wire contract.
    expect(hash).toBe("687e589ddb606fc0bd7a07284be11bbaa4d5a4d22c562f8adf87d92833a4610a");
  });
});
