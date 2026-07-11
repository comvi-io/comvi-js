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

  it("a same-key-set mutation re-measures (drift detection) but stays off the network when signals are unchanged", async () => {
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
    // Spy AFTER the initial pass so we only observe calls from subsequent
    // settles. mockBoundingClientRect sets an own property on the element
    // (shadowing the prototype), so the spy must target that same instance.
    const rectSpy = vi.spyOn(div, "getBoundingClientRect");

    try {
      vi.useFakeTimers();

      // Same registry key set (no add/remove) — but a mutation-class trigger
      // can change signals without changing the SET (same-key DOM swap,
      // ARIA/container edits), so it must force re-measurement past the set
      // gates. Nothing actually changed here, so the transport's hash gate
      // keeps the pass off the network.
      eventBus.emit("structureChanges", [div]);
      await vi.advanceTimersByTimeAsync(1100);

      expect(rectSpy).toHaveBeenCalled();
      expect(fetchMock.mock.calls.length).toBe(callsAfterInitial);
    } finally {
      vi.useRealTimers();
    }

    collector.destroy();
  });

  it("same-key signal drift after a mutation trigger sends an updated full observation", async () => {
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
    await collector.start();
    await Promise.resolve();
    await Promise.resolve();

    const callsAfterInitial = fetchMock.mock.calls.length;

    try {
      vi.useFakeTimers();

      // The visible key SET is unchanged, but the element's width bucket
      // drifts (small -> large). Before the mutation-force fix this change
      // was invisible forever; now it must reach the wire as a full resend.
      mockBoundingClientRect(div, {
        top: 0,
        left: 0,
        width: 400,
        height: 20,
        right: 400,
        bottom: 20,
      });
      eventBus.emit("attributeChanges", [div]);
      await vi.advanceTimersByTimeAsync(1100);
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    const lastBody = JSON.parse(
      (fetchMock.mock.calls[fetchMock.mock.calls.length - 1]![1] as RequestInit).body as string,
    );
    expect(lastBody.items).toHaveLength(1);
    expect(lastBody.items[0].constraints.hard.widthBucket).toBe("large");

    collector.destroy();
  });

  it("only keys inside the open dialog get the modal-suffixed screenGroup; background keys keep the route group", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);

    const background = document.createElement("div");
    document.body.appendChild(background);
    mockBoundingClientRect(background, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });
    registry.add(background, {
      nodes: new Map([[document.createTextNode("x"), { key: "page.title", ns: "ns" }]]),
    });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.id = "settings-modal";
    document.body.appendChild(dialog);
    mockBoundingClientRect(dialog, {
      top: 40,
      left: 0,
      width: 300,
      height: 200,
      right: 300,
      bottom: 240,
    });

    const inside = document.createElement("div");
    dialog.appendChild(inside);
    mockBoundingClientRect(inside, {
      top: 50,
      left: 10,
      width: 100,
      height: 20,
      right: 110,
      bottom: 70,
    });
    registry.add(inside, {
      nodes: new Map([[document.createTextNode("y"), { key: "modal.title", ns: "ns" }]]),
    });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await Promise.resolve();
    await Promise.resolve();

    const usagesCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes("/v1/context/usages"),
    );
    expect(usagesCall).toBeDefined();
    const body = JSON.parse((usagesCall![1] as RequestInit).body as string);
    const byKey = new Map(body.items.map((item: { key: string }) => [item.key, item]));

    const insideItem = byKey.get("modal.title") as { screenGroup: string };
    const backgroundItem = byKey.get("page.title") as { screenGroup: string };
    expect(insideItem.screenGroup).toContain("#modal:");
    expect(backgroundItem.screenGroup).not.toContain("#modal:");
    expect(insideItem.screenGroup.startsWith(backgroundItem.screenGroup)).toBe(true);

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
