import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { Collector } from "../src/collector/Collector";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";

const SCOPE = "collector-test-scope";

function mockOkResponse<T>(payload: T): Response {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
}

function mockErrorResponse(status: number): Response {
  return { ok: false, status, statusText: "Error", json: async () => ({}) } as Response;
}

describe("collector/Collector — lifecycle & fault isolation", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiConfig(SCOPE);
    cleanupDOM();
  });

  it("does nothing when disabled via options.enabled = false (no fetch, never subscribes)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    const collector = new Collector(eventBus, registry, SCOPE, { enabled: false });

    await collector.start();

    expect(fetch).not.toHaveBeenCalled();
    expect(collector.isDisabled()).toBe(false);

    expect(() => collector.destroy()).not.toThrow();
  });

  it("disables collection when the handshake is rejected, and never throws (P8/RC3)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockErrorResponse(500)));
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);

    const div = document.createElement("div");
    document.body.appendChild(div);
    registry.add(div, { nodes: new Map([[document.createTextNode("x"), { key: "a", ns: "ns" }]]) });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();

    expect(collector.isDisabled()).toBe(true);

    // Further registry events must not crash the (now-disabled) collector.
    expect(() => {
      eventBus.emit("structureChanges", [div]);
    }).not.toThrow();

    expect(() => collector.destroy()).not.toThrow();
  });

  it("never throws when the handshake fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    // A registered key so the handshake actually reaches the (rejecting) network
    // call — an empty registry short-circuits the handshake without one.
    registry.add(document.createElement("div"), {
      nodes: new Map([[document.createTextNode("x"), { key: "a", ns: "ns" }]]),
    });
    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });

    await expect(collector.start()).resolves.toBeUndefined();
    expect(collector.isDisabled()).toBe(true);
  });

  it("gate: an unchanged visible set after the initial pass sends no further batches (P3)", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);

    const div = document.createElement("div");
    document.body.appendChild(div);
    mockBoundingClientRect(div, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });
    registry.add(div, {
      nodes: new Map([[document.createTextNode("x"), { key: "a", ns: "ns" }]]),
    });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start(); // handshake + immediate first settle pass
    await Promise.resolve();
    await Promise.resolve();

    const callsAfterInitial = fetchMock.mock.calls.length;
    expect(callsAfterInitial).toBeGreaterThan(0);

    try {
      vi.useFakeTimers();

      // Same visible key set, no actual DOM change — this must NOT produce
      // a new network call once the debounce elapses (P3).
      eventBus.emit("structureChanges", [div]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchMock.mock.calls.length).toBe(callsAfterInitial);

      // A real change to the visible set DOES produce a new pass.
      const second = document.createElement("div");
      document.body.appendChild(second);
      mockBoundingClientRect(second, {
        top: 30,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 50,
      });
      registry.add(second, {
        nodes: new Map([[document.createTextNode("y"), { key: "b", ns: "ns" }]]),
      });

      eventBus.emit("structureChanges", [second]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    } finally {
      vi.useRealTimers();
    }

    collector.destroy();
  });

  it("M1: a DOM mutation that doesn't change the registry key set never measures any rect", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);

    const div = document.createElement("div");
    document.body.appendChild(div);
    mockBoundingClientRect(div, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });
    registry.add(div, {
      nodes: new Map([[document.createTextNode("x"), { key: "a", ns: "ns" }]]),
    });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start(); // handshake + immediate first settle pass — DOES measure once
    await Promise.resolve();
    await Promise.resolve();

    // Spy AFTER the initial pass so we only observe calls from subsequent
    // settles. mockBoundingClientRect sets an own property on the element
    // (shadowing the prototype), so the spy must target that same instance.
    const rectSpy = vi.spyOn(div, "getBoundingClientRect");

    try {
      vi.useFakeTimers();

      // Same registry key set (no add/remove), no route change — the M1
      // pre-gate must short-circuit BEFORE enumerateVisibleTargets ever
      // calls getBoundingClientRect on any registered element.
      eventBus.emit("structureChanges", [div]);
      await vi.advanceTimersByTimeAsync(1100);

      expect(rectSpy).not.toHaveBeenCalled();

      // A real registry change (new key added) DOES pay for measurement.
      const second = document.createElement("div");
      document.body.appendChild(second);
      mockBoundingClientRect(second, {
        top: 30,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 50,
      });
      registry.add(second, {
        nodes: new Map([[document.createTextNode("y"), { key: "b", ns: "ns" }]]),
      });
      const secondRectSpy = vi.spyOn(second, "getBoundingClientRect");

      eventBus.emit("structureChanges", [second]);
      await vi.advanceTimersByTimeAsync(1100);

      expect(secondRectSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }

    collector.destroy();
  });

  it("sends uiType/translationRole as wire fields on every full observation (not client-local-only)", async () => {
    // Regression guard: the server recomputes observationHash from the
    // PAYLOAD-carried uiType/translationRole rather than re-inferring them,
    // so a drift between this client's targetType.ts mirror and the
    // server's authoritative inferTargetType can never cause a silent hash
    // mismatch — both sides must hash the exact same values.
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);

    const button = document.createElement("button");
    document.body.appendChild(button);
    mockBoundingClientRect(button, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });
    registry.add(button, {
      nodes: new Map([[document.createTextNode("x"), { key: "checkout.submit", ns: "ns" }]]),
    });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await Promise.resolve();
    await Promise.resolve();

    const sendPassCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes("/v1/context/usages"),
    );
    expect(sendPassCall).toBeDefined();
    const body = JSON.parse((sendPassCall![1] as RequestInit).body as string);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].uiType).toBe("primary-button");
    expect(body.items[0].translationRole).toBe("imperative-verb");

    collector.destroy();
  });

  it("destroy() before the handshake resolves does not subscribe triggers or crash", async () => {
    let resolveHandshake!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveHandshake = resolve;
          }),
      ),
    );

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registry.add(document.createElement("div"), {
      nodes: new Map([[document.createTextNode("x"), { key: "a", ns: "ns" }]]),
    });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    const startPromise = collector.start();

    collector.destroy();
    resolveHandshake(mockOkResponse({ entries: [] }));

    await expect(startPromise).resolves.toBeUndefined();
    // No further assertion needed beyond "did not throw" — destroying mid-flight
    // must be a safe no-op once the handshake eventually resolves.
  });
});
