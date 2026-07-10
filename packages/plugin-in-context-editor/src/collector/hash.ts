/**
 * The observation hash (RALPLAN "observation hash & convergence contract",
 * RC2/RC-A) — thin adapter over the canonical cross-repo spec.
 *
 * `./hash/observation-hash.ts` is a BYTE-IDENTICAL copy of the platform's
 * canonical implementation (`apps/api/src/modules/context/hash/observation-hash.ts`,
 * authored by worker-platform per RALPLAN iteration-4 1b). It has zero
 * imports and is pure/synchronous, so the exact same source runs in both
 * repos and produces identical output. Any change to it must be mirrored
 * byte-for-byte in both places, together with a `HASH_FN_VERSION` bump and a
 * regenerated `observation-hash.fixtures.json` (also byte-identical here).
 *
 * This module exists only to adapt the canonical FLAT input shape
 * (`{uiType, translationRole, mustBeShort, singleLine, widthBucket,
 * neighbors}`) to the richer shapes the rest of the collector already works
 * with (`ConstraintSignals`, `NeighborCandidate`), so `Collector.ts`'s call
 * site didn't need to change when the canonical spec landed.
 *
 * This hash is used ONLY for this client's local send-vs-ping gate (RC-A) —
 * the server recomputes authoritatively on ingest and that value always
 * wins; a client/server divergence is never an error (RALPLAN "honest
 * degradation" note).
 */

import type { ConstraintSignals, NeighborCandidate, TranslationRole, UiType } from "./types";
import {
  computeObservationHash as computeCanonicalObservationHash,
  HASH_FN_VERSION,
  type ObservationHashInput as CanonicalObservationHashInput,
  type ObservationHashNeighbor,
} from "./hash/observation-hash";

export { HASH_FN_VERSION };

export interface ObservationHashInput {
  uiType: UiType;
  translationRole: TranslationRole;
  constraints: ConstraintSignals;
  neighbors: NeighborCandidate[];
}

function toCanonicalNeighbor(n: NeighborCandidate): ObservationHashNeighbor {
  return {
    namespace: n.namespace,
    key: n.key,
    relativePosition: n.relativePosition,
    sameContainerAs: n.sameContainerAs,
    readingOrderIndex: n.readingOrderIndex,
    distance: n.distance,
  };
}

function toCanonicalInput(input: ObservationHashInput): CanonicalObservationHashInput {
  return {
    uiType: input.uiType,
    translationRole: input.translationRole,
    mustBeShort: input.constraints.hard.mustBeShort,
    singleLine: input.constraints.hard.singleLine,
    widthBucket: input.constraints.hard.widthBucket,
    neighbors: input.neighbors.map(toCanonicalNeighbor),
  };
}

export function computeObservationHash(input: ObservationHashInput): string {
  return computeCanonicalObservationHash(toCanonicalInput(input));
}
