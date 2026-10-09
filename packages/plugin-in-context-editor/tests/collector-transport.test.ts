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

function usagesOk(): Response {
  return mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 });
}

function hydratedEntry(
  namespace: string,
  key: string,
  screenGroup: string,
  observationHash: string,
) {
  return {
    namespace,
    key,
    profileHash: "p1",
    confidenceLevel: "high",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    screenGroups: [{ screenGroup, observationHash }],
  };
}

function makePassItem(overrides: Partial<Observation> = {}, localHash = "hash-a"): PassItem {
  return {
    observation: makeObservation(overrides),
    localHash,
    readingOrderIndex: 0,
  };
}

/** The JSON body of the `index`-th recorded fetch call (negative counts from the end). */
function sentBody(index: number) {
  const calls = vi.mocked(fetch).mock.calls;
  const call = calls[index < 0 ? calls.length + index : index] as [string, RequestInit];
  return JSON.parse(call[1].body as string);
}

/** The usages response the server sends when nothing needs re-sending. */
function usagesOkResponse(): Response {
  return mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 });
}

/** Re-initializes the scope without an apiKey, which is what demo mode is. */
function useDemoMode(): void {
  resetApiConfig(SCOPE);
  initApiConfig(undefined, SCOPE);
}

describe("collector/transport", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
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
      useDemoMode();
      const transport = new CollectorTransport(SCOPE);
      const ok = await transport.handshake([{ namespace: "ns", key: "a" }]);
      expect(ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("one key → one POST to /v1/context/handshake carrying that key", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(mockOkResponse({ entries: [] }));
      const transport = new CollectorTransport(SCOPE);

      await transport.handshake([{ namespace: "ns", key: "a" }]);

      expect(
        fetchMock.mock.calls.map(([url, init]) => ({
          handshakeEndpoint: String(url).includes("/v1/context/handshake"),
          method: (init as RequestInit).method,
          body: JSON.parse((init as RequestInit).body as string),
        })),
      ).toEqual([
        {
          handshakeEndpoint: true,
          method: "POST",
          body: { keys: [{ namespace: "ns", key: "a" }] },
        },
      ]);
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

      it("250 keys → three handshake POSTs of 100, 100 and 50 keys, and the handshake succeeds", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue(mockOkResponse({ entries: [] }));
        const transport = new CollectorTransport(SCOPE);

        const ok = await transport.handshake(makeKeys(250));

        expect({
          ok,
          sizes: fetchMock.mock.calls.map(
            ([, init]) =>
              (JSON.parse((init as RequestInit).body as string).keys as unknown[]).length,
          ),
        }).toEqual({ ok: true, sizes: [100, 100, 50] });
      });

      it("emits no trailing empty batch when the key count is an exact multiple of 100", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue(mockOkResponse({ entries: [] }));

        const transport = new CollectorTransport(SCOPE);
        await transport.handshake(makeKeys(200));

        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      /** Handshake over 250 keys whose first two chunks each hydrate one screen group. */
      function mockTwoHydratingChunks(): void {
        vi.mocked(fetch)
          .mockResolvedValueOnce(
            mockOkResponse({ entries: [hydratedEntry("ns", "key-0", "/a", "hash-0")] }),
          )
          .mockResolvedValueOnce(
            mockOkResponse({ entries: [hydratedEntry("ns", "key-150", "/b", "hash-150")] }),
          )
          .mockResolvedValueOnce(mockOkResponse({ entries: [] }));
      }

      it("two chunks hydrating entries, the third empty → the handshake succeeds", async () => {
        mockTwoHydratingChunks();
        const transport = new CollectorTransport(SCOPE);

        const ok = await transport.handshake(makeKeys(250));

        expect(ok).toBe(true);
      });

      it("entries from two chunks merged into one gate map → a pass matching both is two pings, no full item", async () => {
        mockTwoHydratingChunks();
        const transport = new CollectorTransport(SCOPE);
        await transport.handshake(makeKeys(250));
        vi.mocked(fetch).mockResolvedValue(usagesOkResponse());

        // Both chunk-0's and chunk-1's entries landed in one merged gate map:
        // a matching still-valid ping for EITHER group must now be a ping,
        // not a full re-send.
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

        const body = sentBody(-1);
        expect({ items: body.items.length, stillValid: body.stillValid.length }).toEqual({
          items: 0,
          stillValid: 2,
        });
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
      // readingOrderIndex/debug/spatial are client-only — the server's
      // ObservationSchema has `additionalProperties: false`, so sending them
      // would be a 400.
      expect(Object.keys(body.items[0]).sort()).toEqual([
        "constraints",
        "key",
        "namespace",
        "neighbors",
        "screenGroup",
        "semantic",
        "translationRole",
        "uiType",
      ]);
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

    it("stamps each batch with the page origin, the hash function version and a POST", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(usagesOk());

      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem()]);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/v1/context/usages");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toMatchObject({
        origin: "http://localhost:3000",
        hashFnVersion: 1,
      });
    });

    it("keeps (ns 'a', key 'bc') and (ns 'ab', key 'c') on separate gate entries", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ entries: [hydratedEntry("a", "bc", "/x", "shared-hash")] }),
      );
      fetchMock.mockResolvedValueOnce(usagesOk());

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "a", key: "bc" }]);
      await transport.sendPass([
        makePassItem({ namespace: "ab", key: "c", screenGroup: "/x" }, "shared-hash"),
      ]);

      const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1);
      expect(body.stillValid).toHaveLength(0);
    });

    it("keeps (key 'bc', group '/x') and (key 'b', group 'c/x') on separate gate entries", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({ entries: [hydratedEntry("a", "bc", "/x", "shared-hash")] }),
      );
      fetchMock.mockResolvedValueOnce(usagesOk());

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "a", key: "bc" }]);
      await transport.sendPass([
        makePassItem({ namespace: "a", key: "b", screenGroup: "c/x" }, "shared-hash"),
      ]);

      const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(1);
      expect(body.stillValid).toHaveLength(0);
    });

    it("hydrates the gate map from an `updated` echo so the next pass pings", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
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
        )
        .mockResolvedValueOnce(usagesOk());

      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "local-hash")]);
      await transport.sendPass([makePassItem({}, "server-hash")]);

      const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(0);
      expect(body.stillValid).toHaveLength(1);
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

    /** First usages reply: the server confirms the full send and echoes the authoritative hash. */
    function mockConfirmedFullSend(): void {
      vi.mocked(fetch).mockResolvedValueOnce(
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
    }

    it("group discovered mid-session, no stored hash (MF-1) → the first pass sends one full item", async () => {
      // No handshake call at all — this screenGroup is discovered mid-session
      // (an empty-keys handshake never hits the network, so the gate map
      // starts empty either way).
      mockConfirmedFullSend();
      const transport = new CollectorTransport(SCOPE);

      await transport.sendPass([makePassItem({}, "server-hash")]);

      expect(sentBody(0).items).toHaveLength(1);
    });

    it("mid-session convergence (MF-1): identical pass after a confirmed full send → no network call", async () => {
      mockConfirmedFullSend();
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "server-hash")]);

      // The confirmed send already proved liveness for this exact state —
      // repeating it (mutation-forced passes rebuild identical observations
      // every settle) must stay off the network entirely.
      await transport.sendPass([makePassItem({}, "server-hash")]);

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("hash changed after a confirmed send → the next pass is a second request with one full item", async () => {
      vi.mocked(fetch).mockResolvedValue(usagesOkResponse());
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "hash-1")]);

      await transport.sendPass([makePassItem({}, "hash-2")]);

      expect({
        calls: vi.mocked(fetch).mock.calls.length,
        items: sentBody(1).items.length,
      }).toEqual({ calls: 2, items: 1 });
    });

    it("full send rejected by the network → not recorded as delivered, the next pass retries it as one full item", async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(usagesOkResponse());
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "hash-a")]);

      await transport.sendPass([makePassItem({}, "hash-a")]);

      // Retried as full, not dropped.
      expect({
        calls: vi.mocked(fetch).mock.calls.length,
        items: sentBody(1).items.length,
      }).toEqual({ calls: 2, items: 1 });
    });

    /** Handshake that hydrates `/checkout` with hash-a, so a matching pass is a ping. */
    async function hydratedTransport(): Promise<CollectorTransport> {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockOkResponse({
          entries: [hydratedEntry("ns", "checkout.submit", "/checkout", "hash-a")],
        }),
      );
      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);
      return transport;
    }

    it("pass matching the handshake hash → exactly one ping request after the handshake", async () => {
      const transport = await hydratedTransport();
      vi.mocked(fetch).mockResolvedValueOnce(usagesOkResponse());

      await transport.sendPass([makePassItem({}, "hash-a")]);

      // Handshake + one ping.
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("identical pass after a confirmed ping → no re-ping for the same state", async () => {
      const transport = await hydratedTransport();
      vi.mocked(fetch).mockResolvedValueOnce(usagesOkResponse());
      await transport.sendPass([makePassItem({}, "hash-a")]);

      await transport.sendPass([makePassItem({}, "hash-a")]);

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    /** Usages reply to a ping: the server reports hash skew and asks for a full resend. */
    function mockResendDemand(): void {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockOkResponse({
          updated: [],
          resend: [{ namespace: "ns", key: "checkout.submit", screenGroup: "/checkout" }],
          orphanObservations: 0,
          hashSkew: 1,
        }),
      );
    }

    it("pass matching the hydrated hash → sent as one still-valid ping", async () => {
      const transport = await hydratedTransport();
      mockResendDemand();

      await transport.sendPass([makePassItem({}, "hash-a")]);

      expect(sentBody(1).stillValid).toHaveLength(1);
    });

    it("a `resend` entry → the NEXT pass sends full even though the local gate map still matches", async () => {
      const transport = await hydratedTransport();
      mockResendDemand();
      await transport.sendPass([makePassItem({}, "hash-a")]);
      vi.mocked(fetch).mockResolvedValueOnce(usagesOkResponse());

      await transport.sendPass([makePassItem({}, "hash-a")]);

      const body = sentBody(2);
      expect({
        items: body.items.map((item: { key: string }) => item.key),
        stillValid: body.stillValid.length,
      }).toEqual({ items: ["checkout.submit"], stillValid: 0 });
    });

    it("consumes the forced-resend marker on a confirmed send, leaving the next pass silent", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [hydratedEntry("ns", "checkout.submit", "/checkout", "hash-a")],
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          updated: [],
          resend: [{ namespace: "ns", key: "checkout.submit", screenGroup: "/checkout" }],
          orphanObservations: 0,
          hashSkew: 1,
        }),
      );
      fetchMock.mockResolvedValueOnce(usagesOk());

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);
      await transport.sendPass([makePassItem({}, "hash-a")]); // ping -> resend demanded
      await transport.sendPass([makePassItem({}, "hash-a")]); // forced full, confirmed

      await transport.sendPass([makePassItem({}, "hash-a")]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("full send answered 500 → not recorded as delivered, the next pass retries it as one full item, no ping", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockErrorResponse(500))
        .mockResolvedValueOnce(usagesOkResponse());
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem({}, "hash-a")]);

      await transport.sendPass([makePassItem({}, "hash-a")]);

      const body = sentBody(1);
      expect({
        calls: vi.mocked(fetch).mock.calls.length,
        items: body.items.length,
        stillValid: body.stillValid.length,
      }).toEqual({ calls: 2, items: 1, stillValid: 0 });
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
    it("150 observations → two requests of 100 and 50 items", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
      );

      const transport = new CollectorTransport(SCOPE);
      const pass = Array.from({ length: 150 }, (_, i) =>
        makePassItem({ key: `key-${i}`, screenGroup: `/screen-${i}` }, `hash-${i}`),
      );

      await transport.sendPass(pass);

      expect({
        calls: fetchMock.mock.calls.length,
        firstItems: sentBody(0).items.length,
        secondItems: sentBody(1).items.length,
        secondStillValid: sentBody(1).stillValid,
      }).toEqual({ calls: 2, firstItems: 100, secondItems: 50, secondStillValid: [] });
    });

    it("carries an empty items array on a ping-only overflow batch", async () => {
      const fetchMock = vi.mocked(fetch);
      const keys = Array.from({ length: 150 }, (_, i) => ({ namespace: "ns", key: `key-${i}` }));
      fetchMock.mockResolvedValue(
        mockOkResponse({
          entries: keys.map((k) => hydratedEntry(k.namespace, k.key, "/checkout", "hash-a")),
        }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake(keys);

      fetchMock.mockResolvedValue(usagesOk());
      await transport.sendPass(keys.map((k) => makePassItem({ key: k.key }, "hash-a")));

      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string);
      expect(body.items).toEqual([]);
      expect(body.stillValid).toHaveLength(50);
    });

    it("does nothing and never calls fetch for an empty pass", async () => {
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("never calls fetch in demo mode", async () => {
      useDemoMode();
      const transport = new CollectorTransport(SCOPE);
      await transport.sendPass([makePassItem()]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("swallows a batch failure and never rejects", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockRejectedValueOnce(new Error("boom"));

      const transport = new CollectorTransport(SCOPE);

      await expect(transport.sendPass([makePassItem()])).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Collector batch failed"),
        expect.any(Error),
      );
    });
  });

  describe("flushOnTeardown", () => {
    it("50 undelivered items at teardown → one keepalive request carrying the first 20", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(mockOkResponse({}));

      const transport = new CollectorTransport(SCOPE);
      const pass = Array.from({ length: 50 }, (_, i) =>
        makePassItem({ key: `key-${i}`, screenGroup: `/screen-${i}` }, `hash-${i}`),
      );
      transport.flushOnTeardown(pass);

      const init = await vi.waitFor(() => {
        const call = fetchMock.mock.calls[0];
        if (!call) throw new Error("no keepalive request yet");
        return call[1] as RequestInit;
      });

      const body = JSON.parse(init.body as string);
      expect({
        calls: fetchMock.mock.calls.length,
        keepalive: init.keepalive,
        items: body.items.length,
        firstKey: body.items[0].key,
      }).toEqual({ calls: 1, keepalive: true, items: 20, firstKey: "key-0" });
    });

    it("does nothing for an empty pass", () => {
      const transport = new CollectorTransport(SCOPE);
      transport.flushOnTeardown([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("caps the keepalive still-valid list at 20 pings", async () => {
      const fetchMock = vi.mocked(fetch);
      const keys = Array.from({ length: 50 }, (_, i) => ({ namespace: "ns", key: `key-${i}` }));
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: keys.map((k) => hydratedEntry(k.namespace, k.key, "/checkout", "hash-a")),
        }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake(keys);
      transport.flushOnTeardown(keys.map((k) => makePassItem({ key: k.key }, "hash-a")));

      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(JSON.parse(init.body as string).stillValid).toHaveLength(20);
    });

    it("entirely still-valid pass at teardown → a keepalive POST to usages carrying only pings", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse({
          entries: [hydratedEntry("ns", "checkout.submit", "/checkout", "hash-a")],
        }),
      );

      const transport = new CollectorTransport(SCOPE);
      await transport.handshake([{ namespace: "ns", key: "checkout.submit" }]);
      transport.flushOnTeardown([makePassItem({}, "hash-a")]);

      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect({
        usagesEndpoint: url.includes("/v1/context/usages"),
        method: init.method,
        keepalive: init.keepalive,
        body: JSON.parse(init.body as string),
      }).toEqual({
        usagesEndpoint: true,
        method: "POST",
        keepalive: true,
        body: expect.objectContaining({
          items: [],
          stillValid: [
            {
              namespace: "ns",
              key: "checkout.submit",
              screenGroup: "/checkout",
              observationHash: "hash-a",
            },
          ],
        }),
      });
    });

    it("every item already delivered this session → teardown sends nothing", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(usagesOk());

      const transport = new CollectorTransport(SCOPE);
      const pass = [makePassItem({}, "hash-a")];
      await transport.sendPass(pass);

      transport.flushOnTeardown(pass);

      // The one call is the earlier sendPass; teardown added none.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("never calls fetch in demo mode", () => {
      useDemoMode();
      const transport = new CollectorTransport(SCOPE);

      transport.flushOnTeardown([makePassItem()]);

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
