/**
 * Canonical observation hash — Wave 2a shared spec (ralplan-wave2a.md §DR hash contract).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE IS A VERSIONED CROSS-REPO SPEC.                                   │
 * │ It is DUPLICATED BYTE-FOR-BYTE into                                         │
 * │   js-sdk/packages/plugin-in-context-editor  (the ICE collector).           │
 * │ It has ZERO imports and depends only on `TextEncoder` (a global in both     │
 * │ Node >=24 and the browser) so the exact same source runs — and produces     │
 * │ identical output — in both repos, synchronously.                            │
 * │                                                                             │
 * │ The server's value is AUTHORITATIVE (RC-A): the client computes this only   │
 * │ for its local send-vs-ping gate and never transmits it on full             │
 * │ observations. A client/server divergence is never an error.                 │
 * │                                                                             │
 * │ ANY change to the canonical form, the neighbor selection, the field set,    │
 * │ or the digest MUST bump `HASH_FN_VERSION` AND regenerate the golden-vector  │
 * │ fixture (`observation-hash.fixtures.json`) in BOTH repos. The committed     │
 * │ fixture makes an intra-repo drift fail CI before it ships; a cross-repo     │
 * │ version lag is caught at runtime by the `hashFnVersion`/`hashFnSkew` signal.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * The hash covers TRANSLATION-AFFECTING fields ONLY:
 *   - `uiType` + `translationRole` (from inferTargetType);
 *   - the stable hard constraints `mustBeShort`, `singleLine`, `widthBucket`
 *     (user-set buckets — NOT raw pixel geometry);
 *   - the top-K neighbor SET, each neighbor reduced to its stable
 *     `(namespace, key)` tuple + `relativePosition` bucket + `sameContainerAs`,
 *     the set sorted by the `(namespace, key)` tuple (order-independent), the K
 *     members selected by `readingOrderIndex` then `distance` (so which
 *     neighbors enter the hash is stable under pixel jitter).
 *
 * EXCLUDED: confidence, raw rect/centerPoint coordinates, timestamps, the
 * `readingOrderIndex`/`distance` values themselves (used only for selection),
 * and all rendered text.
 */

/** Integer version of the canonical hash spec. Bump on ANY output-affecting change. */
export const HASH_FN_VERSION = 1;

/**
 * Number of neighbors that enter the hash. Selection is by `readingOrderIndex`
 * then `distance`; keeping this below the per-observation neighbor cap makes the
 * selection meaningful and jitter-stable. Part of the versioned spec — changing
 * it requires a `HASH_FN_VERSION` bump + fixture regen.
 */
export const HASH_NEIGHBOR_TOP_K = 8;

/** A neighbor reference as it feeds the hash. Structural types keep this file portable. */
export interface ObservationHashNeighbor {
  /** Stable namespace of the neighbor's translation key. */
  namespace: string;
  /** Stable key name of the neighbor's translation key. */
  key: string;
  /** Bucketed relative position: 'above' | 'below' | 'left' | 'right' | 'same-container'. */
  relativePosition: string;
  /** Shared container type, or null. */
  sameContainerAs: string | null;
  /** Deterministic reading-order rank (top-to-bottom, left-to-right). Selection only. */
  readingOrderIndex: number;
  /** Center-to-center distance. Selection tie-break only; never hashed. */
  distance: number;
}

/** The minimal, translation-affecting subset of an observation that feeds the hash. */
export interface ObservationHashInput {
  /** Resolved UI type (from inferTargetType). */
  uiType: string;
  /** Resolved translation role (from inferTargetType). */
  translationRole: string;
  /** Hard constraint: text is truncated / must be very short. */
  mustBeShort: boolean;
  /** Hard constraint: single-line element. */
  singleLine: boolean;
  /** Hard constraint: bucketed width ('tiny' | 'small' | 'medium' | 'large' | 'full'). */
  widthBucket: string;
  /** All candidate neighbor references (unsorted); the hash selects and sorts internally. */
  neighbors: ObservationHashNeighbor[];
}

// ── Neighbor selection (deterministic, jitter-stable) ────────────────────────

function compareByTuple(a: ObservationHashNeighbor, b: ObservationHashNeighbor): number {
  if (a.namespace < b.namespace) return -1;
  if (a.namespace > b.namespace) return 1;
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

function compareForSelection(a: ObservationHashNeighbor, b: ObservationHashNeighbor): number {
  if (a.readingOrderIndex !== b.readingOrderIndex) {
    return a.readingOrderIndex - b.readingOrderIndex;
  }
  if (a.distance !== b.distance) {
    return a.distance - b.distance;
  }
  // Final total-order tie-break so selection is fully deterministic.
  return compareByTuple(a, b);
}

/**
 * Select the top-K neighbors by `readingOrderIndex` then `distance`, then return
 * them sorted by the `(namespace, key)` tuple so the hashed set is order-independent.
 */
function selectHashNeighbors(neighbors: ObservationHashNeighbor[]): ObservationHashNeighbor[] {
  const bySelection = [...neighbors].sort(compareForSelection);
  return bySelection.slice(0, HASH_NEIGHBOR_TOP_K).sort(compareByTuple);
}

// ── Canonical serialization ──────────────────────────────────────────────────

/**
 * Deterministic canonical string fed to the digest. Built as a pure
 * array-of-primitives structure whose `JSON.stringify` output is byte-identical
 * across Node and every browser (array order is preserved; strings are
 * JSON-escaped; booleans/nulls/integers are canonical). The leading
 * `HASH_FN_VERSION` binds the digest to this spec version.
 */
export function serializeObservationForHash(input: ObservationHashInput): string {
  const neighbors = selectHashNeighbors(input.neighbors).map((n) => [
    n.namespace,
    n.key,
    n.relativePosition,
    n.sameContainerAs,
  ]);
  return JSON.stringify([
    HASH_FN_VERSION,
    input.uiType,
    input.translationRole,
    input.mustBeShort,
    input.singleLine,
    input.widthBucket,
    neighbors,
  ]);
}

/** Compute the canonical observation hash (lowercase hex SHA-256). */
export function computeObservationHash(input: ObservationHashInput): string {
  return sha256Hex(serializeObservationForHash(input));
}

// ── Pure SHA-256 (self-contained, no platform crypto) ────────────────────────
// Standard FIPS 180-4 SHA-256 over the UTF-8 bytes of the message. Kept inline
// so the whole file copies byte-for-byte into the plugin and stays synchronous
// in the browser (Web Crypto's digest is async).

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function toHex8(x: number): string {
  return (x >>> 0).toString(16).padStart(8, "0");
}

export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const l = bytes.length;
  const withOne = l + 1;
  const pad = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + pad + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  const bitLen = l * 8;
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    toHex8(h0) +
    toHex8(h1) +
    toHex8(h2) +
    toHex8(h3) +
    toHex8(h4) +
    toHex8(h5) +
    toHex8(h6) +
    toHex8(h7)
  );
}
