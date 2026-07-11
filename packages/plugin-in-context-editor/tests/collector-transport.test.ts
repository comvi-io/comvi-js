import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { CollectorTransport, type PassItem } from "../src/collector/transport";
import type { Observation } from "../src/collector/types";

const SCOPE = "test-scope";

function mockOkResponse<T>(payload: T): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}

function mockErrorResponse(status: number): Response {
  return { ok: false, status, statusText: "Error", json: async () => ({}) } as Response;
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    namespace: "ns",
    key: "checkout.submit",
    screenGroup: "/checkout",
    uiType: "primary-button",
    translationRole: "imperative-verb",
    semantic: {
      semanticRole: "button",
      ariaRole: null,
      hasAriaLabel: false,
      htmlType: null,
      hasPlaceholder: false,
      ancestry: [],
    },
    constraints: {
      hard: { mustBeShort: false, singleLine: true, widthBucket: "medium" },
      soft: { likelyTruncated: false, visuallyCompact: false, visualProminence: "medium" },
    },
    neighbors: [],
    ...overrides,
  };
}

function makePassItem(overrides: Partial<Observation> = {}, localHash = "hash-a"): PassItem {
  return {
    observation: makeObservation(overrides),
    localHash,
    readingOrderIndex: 0,
  };
}

describe("collector/transport", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiConfig(SCOPE);
  });

  describe("handshake", () => {
    it("returns true without a network call when there are no keys to hydrate", async () => {
      const transport = new CollectorTransport(SCOPE);
      const ok = await transport.handshake([]);
      expect(ok).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("returns false without a network call in demo mode", async () => {
      resetApiConfig(SCOPE);
      initApiConfig(undefined, SCOPE); // no apiKey -> demo mode
      const transport = new CollectorTransport(SCOPE);
      const ok = await transport.handshake([{ namespace: "ns", key: "a" }]);
      expect(ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("POSTs to /v1/context/handshake with the given keys", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(mockOkResponse({ entries: [] }));

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "a" }]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/v1/context/handshake");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ keys: [{ namespace: "ns", key: "a" }] });
    });

    it("returns false on a non-ok response", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(mockErrorResponse(500));

      const transport = new CollectorTransport(SCOPE);
      const ok = await transport.handshake([{ namespace: "ns", key: "a" }]);
      expect(ok).toBe(false);
    });

    it("returns false (never throws) when fetch rejects", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      const transport = new CollectorTransport(SCOPE);
      await expect(transport.handshake([{ namespace: "ns", key: "a" }])).resolves.toBe(false);
    });

    describe("chunking (B2)", () => {
      function makeKeys(count: number): { namespace: string; key: string }[] {
        return Array.from({ length: count }, (_, i) => ({ namespace: "ns", key: `key-${i}` }));
      }

      it("splits a 250-key registry into 3 handshake POSTs of <=100 keys each", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue(mockOkResponse({ entries: [] }));

        const transport = new CollectorTransport(SCOPE);
        const ok = await transport.handshake(makeKeys(250));

        expect(ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const sizes = fetchMock.mock.calls.map(
          ([, init]) => (JSON.parse((init as RequestInit).body as string).keys as unknown[]).length,
        );
        expect(sizes).toEqual([100, 100, 50]);
      });

      it("merges entries from every successful chunk into one gate map", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
          .mockResolvedValueOnce(
            mockOkResponse({
              entries: [
                {
                  namespace: "ns",
                  key: "key-0",
                  profileHash: "p0",
                  confidenceLevel: "high",
                  lastSeenAt: "2026-01-01T00:00:00.000Z",
                  screenGroups: [{ screenGroup: "/a", observationHash: "hash-0" }],
                },
              ],
            }),
          )
          .mockResolvedValueOnce(
            mockOkResponse({
              entries: [
                {
                  namespace: "ns",
                  key: "key-150",
                  profileHash: "p1",
                  confidenceLevel: "high",
                  lastSeenAt: "2026-01-01T00:00:00.000Z",
                  screenGroups: [{ screenGroup: "/b", observationHash: "hash-150" }],
                },
              ],
            }),
          )
          .mockResolvedValueOnce(mockOkResponse({ entries: [] }));

        const transport = new CollectorTransport(SCOPE);
        const ok = await transport.handshake(makeKeys(250));
        expect(ok).toBe(true);

        // Both chunk-0's and chunk-1's entries landed in one merged gate map:
        // a matching still-valid ping for EITHER group must now be a ping,
        // not a full re-send.
        fetchMock.mockResolvedValue(
          mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
        );
        await transport.sendPass([
          {
            observation: makeObservation({ key: "key-0", screenGroup: "/a" }),
            localHash: "hash-0",
            readingOrderIndex: 0,
          },
          {
            observation: makeObservation({ key: "key-150", screenGroup: "/b" }),
            localHash: "hash-150",
            readingOrderIndex: 0,
          },
        ]);

        const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
          string,
          RequestInit,
        ];
        const body = JSON.parse(lastCall[1].body as string);
        expect(body.items).toHaveLength(0);
        expect(body.stillValid).toHaveLength(2);
      });

      it("best-effort: one failed chunk does not disable collection if another chunk succeeds", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
          .mockResolvedValueOnce(mockErrorResponse(500))
          .mockResolvedValueOnce(mockOkResponse({ entries: [] }))
          .mockResolvedValueOnce(mockOkResponse({ entries: [] }));

        const transport = new CollectorTransport(SCOPE);
        const ok = await transport.handshake(makeKeys(250));

        expect(ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });

      it("disables collection only when EVERY chunk fails", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue(mockErrorResponse(500));

        const transport = new CollectorTransport(SCOPE);
        const ok = await transport.handshake(makeKeys(250));

        expect(ok).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });

      it("tolerates a mix of network rejection and non-ok response across chunks", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
          .mockRejectedValueOnce(new Error("network down"))
          .mockResolvedValueOnce(mockErrorResponse(500))
          .mockResolvedValueOnce(mockOkResponse({ entries: [] }));

        const transport = new CollectorTransport(SCOPE);
        const ok = await transport.handshake(makeKeys(250));

        expect(ok).toBe(true); // the third chunk succeeded
      });
    });
  });

  describe("sendPass — resend gate (B1)", () => {
    it("sends a full observation when there is no stored hash for the group", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem()]);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.items).toHaveLength(1);
      expect(body.stillValid).toHaveLength(0);
      expect(body.items[0]).not.toHaveProperty("observationHash");
      // uiType/translationRole ARE wire fields (not client-local-only): the
      // server recomputes observationHash from these payload-carried values
      // rather than re-inferring them, so a client/server inferTargetType
      // mirror drift can never cause a silent hash mismatch.
      expect(body.items[0].uiType).toBe("primary-button");
      expect(body.items[0].translationRole).toBe("imperative-verb");
      // B1: readingOrderIndex/debug/spatial are client-only — the server's
      // ObservationSchema has `additionalProperties: false` and doesn't
      // define them, so sending them would be a 400.
      expect(body.items[0]).not.toHaveProperty("readingOrderIndex");
      expect(body.items[0]).not.toHaveProperty("debug");
      expect(body.items[0]).not.toHaveProperty("spatial");
      expect(Object.keys(body.items[0]).sort()).toEqual(
        [
          "constraints",
          "key",
          "namespace",
          "neighbors",
          "screenGroup",
          "semantic",
          "translationRole",
          "uiType",
        ].sort(),
      );
    });

    it("sends a still-valid ping once the handshake hash matches the local hash", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [
            {
              namespace: "ns",
              key: "checkout.submit",
              profileHash: "p1",
              confidenceLevel: "high",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              screenGroups: [{ screenGroup: "/checkout", observationHash: "hash-a" }],
            },
          ],
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);
      await transport.sendPass([makePassItem({}, "hash-a")]);

      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.items).toHaveLength(0);
      expect(body.stillValid).toEqual([
        {
          namespace: "ns",
          key: "checkout.submit",
          screenGroup: "/checkout",
          observationHash: "hash-a",
        },
      ]);
    });

    it("sends full when the local hash diverges from the stored hash", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [
            {
              namespace: "ns",
              key: "checkout.submit",
              profileHash: "p1",
              confidenceLevel: "high",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              screenGroups: [{ screenGroup: "/checkout", observationHash: "stale-hash" }],
            },
          ],
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);
      await transport.sendPass([makePassItem({}, "new-hash")]);

      const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1);
      expect(body.stillValid).toHaveLength(0);
    });

    it("mid-session convergence (MF-1): after a confirmed full send, an identical pass makes NO network call", async () => {
      const fetchMock = vi.mocked(fetch);
      // No handshake call at all — this screenGroup is discovered mid-session
      // (an empty-keys handshake never hits the network, so the gate map
      // starts empty either way).
      // First pass: full observation; server echoes back the authoritative hash.
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          updated: [
            {
              namespace: "ns",
              key: "checkout.submit",
              screenGroup: "/checkout",
              observationHash: "server-hash",
              profileHash: "p1",
            },
          ],
          resend: [],
          orphanObservations: 0,
          hashSkew: 0,
        }),
      );

      const transport = new CollectorTransport(SCOPE);

      await transport.sendPass([makePassItem({}, "server-hash")]);
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1); // first pass: no stored hash yet -> full

      // The confirmed send already proved liveness for this exact state —
      // repeating it (mutation-forced passes rebuild identical observations
      // every settle) must stay off the network entirely.
      await transport.sendPass([makePassItem({}, "server-hash")]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a changed hash after convergence sends full again", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "hash-1")]);
      await transport.sendPass([makePassItem({}, "hash-2")]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1);
    });

    it("a failed full send is NOT recorded as delivered and retries on the next pass", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(
          mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
        );

      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "hash-a")]);
      await transport.sendPass([makePassItem({}, "hash-a")]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1); // retried as full, not dropped
    });

    it("a still-valid ping is sent once; identical later passes stay silent", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [
            {
              namespace: "ns",
              key: "checkout.submit",
              profileHash: "p1",
              confidenceLevel: "high",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              screenGroups: [{ screenGroup: "/checkout", observationHash: "hash-a" }],
            },
          ],
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);

      await transport.sendPass([makePassItem({}, "hash-a")]);
      expect(fetchMock).toHaveBeenCalledTimes(2); // handshake + one ping

      await transport.sendPass([makePassItem({}, "hash-a")]);
      expect(fetchMock).toHaveBeenCalledTimes(2); // no re-ping for the same state
    });

    it("a `resend` entry forces the NEXT pass to send full even though the local gate map still matches", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [
            {
              namespace: "ns",
              key: "checkout.submit",
              profileHash: "p1",
              confidenceLevel: "high",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              screenGroups: [{ screenGroup: "/checkout", observationHash: "hash-a" }],
            },
          ],
        }),
      );
      // First pass would be a ping, but the server reports a hash-skew resend.
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          updated: [],
          resend: [{ namespace: "ns", key: "checkout.submit", screenGroup: "/checkout" }],
          orphanObservations: 0,
          hashSkew: 1,
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);

      await transport.sendPass([makePassItem({}, "hash-a")]);
      let body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.stillValid).toHaveLength(1); // matches -> ping, server then asks for resend

      await transport.sendPass([makePassItem({}, "hash-a")]);
      body = JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1); // forced full despite matching local hash
      expect(body.stillValid).toHaveLength(0);
    });

    it("a forced-resend marker survives a failed POST and still forces full on the pass after (RC-A)", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [
            {
              namespace: "ns",
              key: "checkout.submit",
              profileHash: "p1",
              confidenceLevel: "high",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              screenGroups: [{ screenGroup: "/checkout", observationHash: "hash-a" }],
            },
          ],
        }),
      );
      // Ping pass: server demands a resend.
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          updated: [],
          resend: [{ namespace: "ns", key: "checkout.submit", screenGroup: "/checkout" }],
          orphanObservations: 0,
          hashSkew: 1,
        }),
      );
      // The forced full send FAILS — the marker must not be consumed.
      fetchMock.mockRejectedValueOnce(new Error("network down"));
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);
      await transport.sendPass([makePassItem({}, "hash-a")]); // ping -> resend demanded
      await transport.sendPass([makePassItem({}, "hash-a")]); // forced full, fails

      await transport.sendPass([makePassItem({}, "hash-a")]); // must STILL be full
      const body = JSON.parse((fetchMock.mock.calls[3]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1);
      expect(body.stillValid).toHaveLength(0);
    });
  });

  describe("sendPass — batching", () => {
    it("chunks more than 100 observations into multiple requests", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      const pass = Array.from({ length: 150 }, (_, i) =>
        makePassItem({ key: `key-${i}`, screenGroup: `/screen-${i}` }, `hash-${i}`),
      );

      await transport.sendPass(pass);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(firstBody.items).toHaveLength(100);
      expect(secondBody.items).toHaveLength(50);
    });

    it("does nothing and never calls fetch for an empty pass", async () => {
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("never calls fetch in demo mode", async () => {
      resetApiConfig(SCOPE);
      initApiConfig(undefined, SCOPE);
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem()]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("swallows a batch failure and never rejects", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockRejectedValueOnce(new Error("boom"));
      const transport = new CollectorTransport(SCOPE);
      await expect(transport.sendPass([makePassItem()])).resolves.toBeUndefined();
    });
  });

  describe("flushOnTeardown", () => {
    it("sends a keepalive request capped well below a normal batch", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(mockOkResponse({}));

      const transport = new CollectorTransport(SCOPE);
      const pass = Array.from({ length: 50 }, (_, i) =>
        makePassItem({ key: `key-${i}`, screenGroup: `/screen-${i}` }, `hash-${i}`),
      );
      transport.flushOnTeardown(pass);

      await Promise.resolve();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.keepalive).toBe(true);
      const body = JSON.parse(init.body as string);
      expect(body.items.length).toBeLessThanOrEqual(20);
    });

    it("does nothing for an empty pass", () => {
      const transport = new CollectorTransport(SCOPE);
      transport.flushOnTeardown([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("never throws even if fetch itself throws synchronously", () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          throw new Error("synchronous boom");
        }),
      );
      const transport = new CollectorTransport(SCOPE);
      expect(() => transport.flushOnTeardown([makePassItem()])).not.toThrow();
    });
  });
});
