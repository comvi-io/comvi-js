/**
 * Handshake + batching + the local send-vs-ping gate (2e, B1/RC-A/MF-1).
 *
 * Owns all network I/O for the collector. Every public method is designed to
 * never throw past its own boundary (RC3/P8) — a handshake or batch failure
 * is reported back as a boolean/silently swallowed, never rejected, so the
 * caller (Collector) can disable collection without any unhandled rejection
 * reaching the host page.
 */

import { getHeaders, getBaseUrl } from "../services/apiClient";
import { isDemoMode } from "../config/api";
import { HASH_FN_VERSION } from "./hash";
import {
  MAX_ITEMS_PER_BATCH,
  type HandshakeResponse,
  type KeyRef,
  type Observation,
  type StillValidPing,
  type UsagesResponse,
} from "./types";

/**
 * A built pass item: the full observation plus this client's local gate
 * hash. `readingOrderIndex` is client-only bookkeeping (hash top-K selection
 * uses the neighbor-level `readingOrderIndex` inside `observation.neighbors`,
 * not this one; this is the target's own index, kept for local diagnostics)
 * — deliberately NOT part of `observation` itself, which is serialized
 * verbatim onto the wire and must match the server's `ObservationSchema`
 * exactly.
 */
export interface PassItem {
  observation: Observation;
  localHash: string;
  readingOrderIndex: number;
}

/** A full-send candidate: the wire observation plus the local hash to record as delivered on a 2xx. */
interface FullSendItem {
  observation: Observation;
  localHash: string;
}

/** Items sent this pass survive teardown with a much smaller cap (keepalive request bodies are size-limited). */
const MAX_TEARDOWN_ITEMS = 20;

function gateKey(namespace: string, key: string, screenGroup: string): string {
  return namespace + "::" + key + "::" + screenGroup;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [[]];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class CollectorTransport {
  /** (namespace,key,screenGroup) -> server-authoritative observationHash, hydrated by the handshake and by every `updated` echo (MF-1). */
  private readonly gateMap = new Map<string, string>();
  /** Groups the server told us to resend in full. Consumed only after a CONFIRMED (2xx) send — a failed POST keeps the marker so the resend retries. */
  private readonly forcedResend = new Set<string>();
  /**
   * (namespace,key,screenGroup) -> last observationHash confirmed delivered
   * this session (a 2xx full send or still-valid ping). The anti-churn floor:
   * mutation-forced passes can rebuild an identical observation every settle,
   * and this map keeps those from becoming network traffic. A hash absent
   * here was never confirmed, so failed sends retry naturally on the next
   * pass instead of being dropped.
   */
  private readonly deliveredHashes = new Map<string, string>();

  constructor(private readonly scopeId: string) {}

  /**
   * Session-start handshake. Chunks `keys` into ≤`MAX_ITEMS_PER_BATCH`-key
   * batches (B2 — the server caps `keys` at the same 100/batch limit, so an
   * unchunked request on any page with >100 registered keys would 400 the
   * whole handshake and disable collection for the entire session).
   *
   * Best-effort merge: each chunk's `entries` are merged into the gate map
   * independently, so a single failed chunk never discards another chunk's
   * successfully hydrated hashes. Returns false (disabling the collector)
   * ONLY if every chunk failed; a partial success keeps the collector active
   * with a partially-hydrated gate map (any group missing from a failed
   * chunk simply sends FULL on its first pass instead of pinging, same as
   * MF-1's mid-session-discovered-group case — never a correctness bug).
   */
  public async handshake(keys: KeyRef[]): Promise<boolean> {
    if (isDemoMode(this.scopeId)) {
      return false;
    }
    if (keys.length === 0) {
      return true; // nothing to hydrate is not a failure
    }

    const batches = chunk(keys, MAX_ITEMS_PER_BATCH);
    let anySucceeded = false;

    for (const batch of batches) {
      try {
        const baseUrl = getBaseUrl(this.scopeId);
        const response = await fetch(baseUrl + "/v1/context/handshake", {
          method: "POST",
          headers: getHeaders(this.scopeId),
          body: JSON.stringify({ keys: batch }),
        });

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as HandshakeResponse;
        for (const entry of data.entries ?? []) {
          for (const screenGroupEntry of entry.screenGroups ?? []) {
            this.gateMap.set(
              gateKey(entry.namespace, entry.key, screenGroupEntry.screenGroup),
              screenGroupEntry.observationHash,
            );
          }
        }
        anySucceeded = true;
      } catch {
        continue;
      }
    }

    return anySucceeded;
  }

  private splitPass(pass: PassItem[]): { full: FullSendItem[]; pings: StillValidPing[] } {
    const full: FullSendItem[] = [];
    const pings: StillValidPing[] = [];

    for (const { observation, localHash } of pass) {
      const key = gateKey(observation.namespace, observation.key, observation.screenGroup);

      if (this.forcedResend.has(key)) {
        full.push({ observation, localHash });
        continue;
      }
      if (this.deliveredHashes.get(key) === localHash) {
        continue; // already confirmed this exact state this session
      }
      if (this.gateMap.get(key) === localHash) {
        pings.push({
          namespace: observation.namespace,
          key: observation.key,
          screenGroup: observation.screenGroup,
          observationHash: localHash,
        });
      } else {
        full.push({ observation, localHash });
      }
    }

    return { full, pings };
  }

  private applyResponse(data: UsagesResponse): void {
    for (const updated of data.updated ?? []) {
      this.gateMap.set(
        gateKey(updated.namespace, updated.key, updated.screenGroup),
        updated.observationHash,
      );
    }
    for (const resend of data.resend ?? []) {
      this.forcedResend.add(gateKey(resend.namespace, resend.key, resend.screenGroup));
    }
  }

  private buildRequestBody(items: Observation[], stillValid: StillValidPing[]): string {
    return JSON.stringify({
      origin: typeof location !== "undefined" ? location.origin : "",
      hashFnVersion: HASH_FN_VERSION,
      items,
      stillValid,
    });
  }

  /**
   * Sends one settle's worth of observations, split full-vs-ping per the B1
   * gate, chunked to the 100/batch cap, folding each response back into the
   * local gate map (MF-1) and forced-resend set.
   */
  public async sendPass(pass: PassItem[]): Promise<void> {
    if (isDemoMode(this.scopeId) || pass.length === 0) {
      return;
    }

    const { full, pings } = this.splitPass(pass);
    const itemChunks = chunk(full, MAX_ITEMS_PER_BATCH);
    const pingChunks = chunk(pings, MAX_ITEMS_PER_BATCH);
    const batchCount = Math.max(itemChunks.length, pingChunks.length, 1);

    for (let i = 0; i < batchCount; i++) {
      await this.sendBatch(itemChunks[i] ?? [], pingChunks[i] ?? []);
    }
  }

  private async sendBatch(items: FullSendItem[], stillValid: StillValidPing[]): Promise<void> {
    if (items.length === 0 && stillValid.length === 0) {
      return;
    }

    try {
      const baseUrl = getBaseUrl(this.scopeId);
      const response = await fetch(baseUrl + "/v1/context/usages", {
        method: "POST",
        headers: getHeaders(this.scopeId),
        body: this.buildRequestBody(
          items.map((item) => item.observation),
          stillValid,
        ),
      });

      if (!response.ok) {
        return;
      }

      // Only a confirmed 2xx consumes forced-resend markers and records
      // delivery — a failed batch leaves both untouched so the next pass
      // retries instead of silently converging on skew.
      for (const { observation, localHash } of items) {
        const key = gateKey(observation.namespace, observation.key, observation.screenGroup);
        this.forcedResend.delete(key);
        this.deliveredHashes.set(key, localHash);
      }
      for (const ping of stillValid) {
        this.deliveredHashes.set(
          gateKey(ping.namespace, ping.key, ping.screenGroup),
          ping.observationHash,
        );
      }

      const data = (await response.json()) as UsagesResponse;
      this.applyResponse(data);
    } catch (error) {
      console.error(
        "[ComviInContextEditor] Collector batch failed; will retry next settle.",
        error,
      );
    }
  }

  /**
   * Best-effort final flush on stop()/pagehide (2e). Uses `fetch` with
   * `keepalive: true` rather than `navigator.sendBeacon` — sendBeacon cannot
   * carry the `Authorization: Bearer` header this API-key-authenticated
   * endpoint requires. Capped much smaller than a normal batch: browsers
   * bound the total size of in-flight keepalive requests. Never throws.
   */
  public flushOnTeardown(pass: PassItem[]): void {
    if (isDemoMode(this.scopeId) || pass.length === 0) {
      return;
    }

    try {
      const { full, pings } = this.splitPass(pass);
      const items = full.slice(0, MAX_TEARDOWN_ITEMS).map((item) => item.observation);
      const stillValid = pings.slice(0, MAX_TEARDOWN_ITEMS);
      if (items.length === 0 && stillValid.length === 0) {
        return;
      }

      const baseUrl = getBaseUrl(this.scopeId);
      void fetch(baseUrl + "/v1/context/usages", {
        method: "POST",
        headers: getHeaders(this.scopeId),
        body: this.buildRequestBody(items, stillValid),
        keepalive: true,
      }).catch(() => {
        // Best-effort — the page is unloading, nothing more we can do.
      });
    } catch {
      // Never let teardown throw.
    }
  }
}
