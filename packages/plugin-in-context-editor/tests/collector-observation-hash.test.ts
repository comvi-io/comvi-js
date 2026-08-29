/**
 * Golden-vector conformance for the canonical observation hash
 * (`src/collector/hash/observation-hash.ts`).
 *
 * The hashed file is a byte-identical copy of the platform's
 * `apps/api/src/modules/context/hash/observation-hash.ts`, and this test
 * mirrors the platform's reference test
 * (`apps/api/src/__tests__/unit/context-observation-hash.test.ts`),
 * so drift in EITHER the ported file or the committed fixture fails CI here
 * before it ships, per the versioned-spec contract.
 */

import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  computeObservationHash,
  serializeObservationForHash,
  sha256Hex,
  HASH_FN_VERSION,
  HASH_NEIGHBOR_TOP_K,
  type ObservationHashInput,
  type ObservationHashNeighbor,
} from "../src/collector/hash/observation-hash";
import fixturesJson from "../src/collector/hash/observation-hash.fixtures.json";

type Fixture = {
  hashFnVersion: number;
  neighborTopK: number;
  vectors: Array<{
    name: string;
    description: string;
    input: ObservationHashInput;
    canonical: string;
    expectedHash: string;
  }>;
};

const fixtures = fixturesJson as unknown as Fixture;

const nodeSha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("sha256Hex (self-contained pure SHA-256)", () => {
  it("matches known NIST vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches node:crypto across ASCII, long, and unicode inputs", () => {
    for (const msg of [
      "The quick brown fox jumps over the lazy dog",
      "a".repeat(1000),
      "x".repeat(55), // block-boundary edge (55 bytes -> single block)
      "y".repeat(56), // block-boundary edge (56 bytes -> two blocks)
      "unicode: ключ café 日本語 🚀",
    ]) {
      expect(sha256Hex(msg)).toBe(nodeSha(msg));
    }
  });
});

describe("observation hash spec constants", () => {
  it("matches the committed fixture version + top-K", () => {
    expect(HASH_FN_VERSION).toBe(fixtures.hashFnVersion);
    expect(HASH_NEIGHBOR_TOP_K).toBe(fixtures.neighborTopK);
  });
});

describe("golden-vector conformance", () => {
  it("has vectors to check", () => {
    expect(fixtures.vectors.length).toBeGreaterThan(0);
  });

  for (const v of fixtures.vectors) {
    it(`reproduces canonical + hash for "${v.name}"`, () => {
      // The canonical serialization is byte-stable...
      expect(serializeObservationForHash(v.input)).toBe(v.canonical);
      // ...and the committed hash is exactly reproduced (catches intra-repo drift).
      expect(computeObservationHash(v.input)).toBe(v.expectedHash);
      // ...and is a real SHA-256 of that canonical string (independent check).
      expect(v.expectedHash).toBe(nodeSha(v.canonical));
    });
  }
});

describe("top-K neighbor selection", () => {
  it("caps the hashed neighbor set at HASH_NEIGHBOR_TOP_K", () => {
    const vector = fixtures.vectors.find((v) => v.name === "error-message-topk-truncation");
    expect(vector).toBeDefined();
    const neighborArray = JSON.parse(vector!.canonical)[6] as unknown[];
    expect(neighborArray.length).toBe(HASH_NEIGHBOR_TOP_K);
  });

  it("selects by readingOrderIndex, dropping later-reading neighbors", () => {
    const neighbor = (
      namespace: string,
      key: string,
      readingOrderIndex: number,
    ): ObservationHashNeighbor => ({
      namespace,
      key,
      relativePosition: "below",
      sameContainerAs: null,
      readingOrderIndex,
      distance: 100,
    });
    const many: ObservationHashNeighbor[] = Array.from({ length: 12 }, (_, i) =>
      neighbor("ns", `k${String(i).padStart(2, "0")}`, i),
    );
    const canonical = JSON.parse(
      serializeObservationForHash({
        uiType: "body-text",
        translationRole: "descriptive-text",
        mustBeShort: false,
        singleLine: false,
        widthBucket: "full",
        neighbors: many,
      }),
    );
    const hashedKeys = (canonical[6] as string[][]).map((n) => n[1]);
    // Reading order 0..7 kept, 8..11 dropped.
    expect(hashedKeys).toEqual(["k00", "k01", "k02", "k03", "k04", "k05", "k06", "k07"]);
  });
});

describe("hash stability (P4)", () => {
  const base: ObservationHashInput = {
    uiType: "primary-button",
    translationRole: "imperative-verb",
    mustBeShort: true,
    singleLine: true,
    widthBucket: "small",
    neighbors: [
      {
        namespace: "common",
        key: "checkout.title",
        relativePosition: "above",
        sameContainerAs: "dialog",
        readingOrderIndex: 0,
        distance: 40,
      },
      {
        namespace: "common",
        key: "checkout.cancel",
        relativePosition: "left",
        sameContainerAs: "dialog",
        readingOrderIndex: 1,
        distance: 60,
      },
      {
        namespace: "nav",
        key: "back",
        relativePosition: "left",
        sameContainerAs: null,
        readingOrderIndex: 2,
        distance: 120,
      },
    ],
  };

  it("is invariant to neighbor input order", () => {
    const reordered: ObservationHashInput = {
      ...base,
      neighbors: [base.neighbors[2]!, base.neighbors[0]!, base.neighbors[1]!],
    };
    expect(computeObservationHash(reordered)).toBe(computeObservationHash(base));
  });

  it("is invariant to distance jitter that preserves reading order", () => {
    const jittered: ObservationHashInput = {
      ...base,
      neighbors: base.neighbors.map((n) => ({ ...n, distance: n.distance + 0.37 })),
    };
    expect(computeObservationHash(jittered)).toBe(computeObservationHash(base));
  });

  it("changes when a translation-affecting field changes", () => {
    const changed: ObservationHashInput = { ...base, uiType: "secondary-button" };
    expect(computeObservationHash(changed)).not.toBe(computeObservationHash(base));
  });

  it("is unaffected by readingOrderIndex values themselves when selection is unchanged", () => {
    const shifted: ObservationHashInput = {
      ...base,
      neighbors: base.neighbors.map((n) => ({
        ...n,
        readingOrderIndex: n.readingOrderIndex + 100,
      })),
    };
    expect(computeObservationHash(shifted)).toBe(computeObservationHash(base));
  });
});

describe("RC-B: structured (namespace,key) tuple, never a flat join", () => {
  it('distinguishes ("weird:ns","a:b") from ("weird","ns:a:b")', () => {
    const mk = (namespace: string, key: string): ObservationHashInput => ({
      uiType: "form-label",
      translationRole: "field-label",
      mustBeShort: false,
      singleLine: true,
      widthBucket: "medium",
      neighbors: [
        {
          namespace,
          key,
          relativePosition: "above",
          sameContainerAs: "form",
          readingOrderIndex: 0,
          distance: 25,
        },
      ],
    });
    expect(computeObservationHash(mk("weird:ns", "a:b"))).not.toBe(
      computeObservationHash(mk("weird", "ns:a:b")),
    );
  });
});
