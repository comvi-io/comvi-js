import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { Collector } from "../src/collector/Collector";
import { CollectorTransport } from "../src/collector/transport";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { mockBoundingClientRect, cleanupDOM, flushMicrotasks, registerVisible } from "./helpers";
import {
  MockIntersectionObserver,
  resetIntersectionObserverMock,
  setIntersecting,
} from "./intersectionObserverMock";

const SCOPE = "collector-test-scope";

function mockOkResponse<T>(payload: T): Response {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
}

function mockErrorResponse(status: number): Response {
  return { ok: false, status, statusText: "Error", json: async () => ({}) } as Response;
}

async function waitForUsagesCall(fetchMock: ReturnType<typeof vi.fn>) {
  return vi.waitFor(() => {
    const call = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes("/v1/context/usages"),
    );
    if (!call) throw new Error("no POST /v1/context/usages was made");
    return call;
  });
}

describe("collector/Collector — lifecycle & fault isolation", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetApiConfig(SCOPE);
    resetIntersectionObserverMock();
    cleanupDOM();
  });

  /** Every POST /v1/context/usages made so far, in order. */
  function usagesCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[][] {
    return fetchMock.mock.calls.filter(([url]) => (url as string).includes("/v1/context/usages"));
  }

  /** fetch double whose handshake succeeds and whose every usages POST 500s. */
  function stubFailingUsagesFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOkResponse({ entries: [] }))
      .mockResolvedValue(mockErrorResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  }

  it("does nothing when disabled via options.enabled = false (no fetch, never subscribes)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    const collector = new Collector(eventBus, registry, SCOPE, { enabled: false });

    const div = registerVisible(registry, "a");
    await collector.start();
    eventBus.emit("structureChanges", [div]);
    await flushMicrotasks();

    expect(fetch).not.toHaveBeenCalled();
    // `isDisabled()` means "disabled by a failed handshake", which never ran here.
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

    const div = registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start(); // handshake + immediate first settle pass
    await flushMicrotasks();

    // Handshake + the first settle pass.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    try {
      vi.useFakeTimers();

      // Same visible key set, no actual DOM change — this must NOT produce
      // a new network call once the debounce elapses.
      eventBus.emit("structureChanges", [div]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // A real change to the visible set DOES produce a new pass.
      const second = registerVisible(registry, "b", {
        top: 30,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 50,
      });

      eventBus.emit("structureChanges", [second]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchMock).toHaveBeenCalledTimes(3);
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

    const div = registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start(); // handshake + immediate first settle pass
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      expect(fetchMock).toHaveBeenCalledTimes(2);
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

    const div = registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    try {
      vi.useFakeTimers();

      // The visible key SET is unchanged, but the element's width bucket
      // drifts (small -> large), which must still reach the wire as a full
      // resend — the set gates alone would never see it.
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
      await flushMicrotasks();
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
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

    registerVisible(registry, "page.title");

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
    await flushMicrotasks();

    const usagesCall = await waitForUsagesCall(fetchMock);
    const body = JSON.parse((usagesCall[1] as RequestInit).body as string);
    const byKey = new Map(body.items.map((item: { key: string }) => [item.key, item]));

    const insideItem = byKey.get("modal.title") as { screenGroup: string };
    const backgroundItem = byKey.get("page.title") as { screenGroup: string };
    expect(backgroundItem.screenGroup).not.toContain("#modal:");
    // "settings-modal" digested to 12 hex chars — the raw id never goes on the wire.
    expect(insideItem.screenGroup).toBe(`${backgroundItem.screenGroup}#modal:a812ad7ac4b7`);

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
    await flushMicrotasks();

    const sendPassCall = await waitForUsagesCall(fetchMock);
    const body = JSON.parse((sendPassCall[1] as RequestInit).body as string);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].uiType).toBe("primary-button");
    expect(body.items[0].translationRole).toBe("imperative-verb");

    collector.destroy();
  });

  it("start() after destroy() warns and never re-runs the handshake", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registerVisible(registry, "a");
    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });

    collector.destroy();
    await collector.start();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Collector.start() called after destroy()"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a throw while collecting the handshake keys disables collection and is logged", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn());
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    vi.spyOn(registry, "entries").mockImplementation(() => {
      throw new Error("registry exploded");
    });
    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });

    await expect(collector.start()).resolves.toBeUndefined();

    expect(collector.isDisabled()).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Collector failed to start"),
      expect.any(Error),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs a rejected sendPass instead of letting it escape the pass", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(CollectorTransport.prototype, "sendPass").mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockOkResponse({ entries: [] })));

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Collector pass failed to send"),
      expect.any(Error),
    );
    expect(collector.isDisabled()).toBe(false);

    collector.destroy();
  });

  it("flushes the last undelivered pass with a keepalive POST on pagehide", async () => {
    const fetchMock = stubFailingUsagesFetch();
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await flushMicrotasks();
    const before = fetchMock.mock.calls.length;

    window.dispatchEvent(new Event("pagehide"));

    const flushed = fetchMock.mock.calls.slice(before);
    expect(flushed).toHaveLength(1);
    expect((flushed[0]![1] as RequestInit).keepalive).toBe(true);

    collector.destroy();
  });

  it("destroy() flushes the last undelivered pass with a keepalive POST", async () => {
    const fetchMock = stubFailingUsagesFetch();
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await flushMicrotasks();
    const before = fetchMock.mock.calls.length;

    collector.destroy();

    const flushed = fetchMock.mock.calls.slice(before);
    expect(flushed).toHaveLength(1);
    expect((flushed[0]![1] as RequestInit).keepalive).toBe(true);
  });

  it("stops flushing on pagehide once destroyed", async () => {
    const fetchMock = stubFailingUsagesFetch();
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await flushMicrotasks();
    collector.destroy();
    const before = fetchMock.mock.calls.length;

    window.dispatchEvent(new Event("pagehide"));

    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it("destroy() unsubscribes the triggers, so a later registration is never observed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockOkResponse({ entries: [] })));
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    registerVisible(registry, "a");

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await flushMicrotasks();
    const io = MockIntersectionObserver.instances[0]!;

    collector.destroy();

    const late = document.createElement("div");
    registry.add(late, {
      nodes: new Map([[document.createTextNode("x"), { key: "late", ns: "ns" }]]),
    });

    expect(io.observed.has(late)).toBe(false);
  });

  describe("after a pass crashes", () => {
    async function startThenCrash(): Promise<{
      collector: Collector;
      fetchMock: ReturnType<typeof vi.fn>;
      registry: TranslationRegistry;
    }> {
      const fetchMock = stubFailingUsagesFetch();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const div = registerVisible(registry, "a");

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.spyOn(registry, "get").mockImplementation(() => {
        throw new Error("registry exploded mid-pass");
      });
      vi.useFakeTimers();
      eventBus.emit("structureChanges", [div]);
      await vi.advanceTimersByTimeAsync(1100);
      vi.useRealTimers();

      return { collector, fetchMock, registry };
    }

    it("disables collection and logs the crash", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { collector } = await startThenCrash();

      expect(collector.isDisabled()).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Collector pass crashed"),
        expect.any(Error),
      );
    });

    it("tears the triggers down so nothing stays observed", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      await startThenCrash();

      expect(MockIntersectionObserver.instances[0]!.observed.size).toBe(0);
    });

    it("skips the teardown flush, because a disabled collector has nothing trustworthy to send", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { collector, fetchMock } = await startThenCrash();
      const before = fetchMock.mock.calls.length;

      collector.destroy();

      expect(fetchMock.mock.calls).toHaveLength(before);
    });
  });

  describe("when teardown itself throws", () => {
    async function startThenFailTeardown(): Promise<{
      collector: Collector;
      eventBus: EventBus;
      registry: TranslationRegistry;
      fetchMock: ReturnType<typeof vi.fn>;
    }> {
      const fetchMock = stubFailingUsagesFetch();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      registerVisible(registry, "a");

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      // Fails on the FIRST unsubscribe, so the triggers stay wired up.
      vi.spyOn(eventBus, "removeListener").mockImplementation(() => {
        throw new Error("unsubscribe exploded");
      });

      return { collector, eventBus, registry, fetchMock };
    }

    it("is caught and logged rather than thrown at the caller", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { collector } = await startThenFailTeardown();

      expect(() => collector.destroy()).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Collector teardown failed"),
        expect.any(Error),
      );
    });

    it("still leaves a destroyed collector unable to run another pass", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { collector, eventBus, registry, fetchMock } = await startThenFailTeardown();
      collector.destroy();
      const before = fetchMock.mock.calls.length;

      vi.useFakeTimers();
      const late = registerVisible(registry, "late.key", {
        top: 40,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 60,
      });
      eventBus.emit("structureChanges", [late]);
      await vi.advanceTimersByTimeAsync(1100);
      vi.useRealTimers();

      expect(fetchMock.mock.calls).toHaveLength(before);
    });
  });

  describe("gating an IO-only settle", () => {
    it("measures no rects on a repeat settle once the mutation flag is consumed", async () => {
      MockIntersectionObserver.autoIntersect = false;
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
          ),
      );
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const div = registerVisible(registry, "a");

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      setIntersecting(div, true);
      await vi.advanceTimersByTimeAsync(600);

      const rectSpy = vi.spyOn(div, "getBoundingClientRect");
      // A mutation-class settle DOES force a re-measure, and consumes the flag.
      eventBus.emit("structureChanges", [div]);
      await vi.advanceTimersByTimeAsync(600);
      expect(rectSpy).toHaveBeenCalled();

      rectSpy.mockClear();
      setIntersecting(div, true);
      await vi.advanceTimersByTimeAsync(600);
      vi.useRealTimers();

      expect(rectSpy).not.toHaveBeenCalled();

      collector.destroy();
    });

    it("sends nothing further when the settle only added a rect-filtered element", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = stubFailingUsagesFetch();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const visible = registerVisible(registry, "visible.key");
      const clipped = registerVisible(registry, "clipped.key", {
        top: -500,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: -480,
      });

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      setIntersecting(visible, true);
      await vi.advanceTimersByTimeAsync(600);
      const before = usagesCalls(fetchMock).length;
      expect(before).toBeGreaterThan(0);

      setIntersecting(clipped, true);
      await vi.advanceTimersByTimeAsync(600);
      vi.useRealTimers();

      expect(usagesCalls(fetchMock)).toHaveLength(before);

      collector.destroy();
    });

    it("re-runs the pass each time the open modal changes over an unchanged key set", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 }),
        );
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const div = registerVisible(registry, "a");

      /** A visible open dialog appended after any earlier one, so it is topmost. */
      function openDialog(id: string): HTMLElement {
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.id = id;
        document.body.appendChild(dialog);
        mockBoundingClientRect(dialog, {
          top: 0,
          left: 0,
          width: 300,
          height: 200,
          right: 300,
          bottom: 200,
        });

        return dialog;
      }

      function lastSentScreenGroup(): string {
        const calls = usagesCalls(fetchMock);
        const body = JSON.parse((calls[calls.length - 1]![1] as RequestInit).body as string);

        return body.items[0].screenGroup as string;
      }

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      setIntersecting(div, true);
      await vi.advanceTimersByTimeAsync(600);
      expect(lastSentScreenGroup()).not.toContain("#modal:");

      // Each dialog opens AROUND the already-registered element: no registry
      // change and no mutation event — only the screenGroup moves.
      openDialog("modal-a").appendChild(div);
      setIntersecting(div, true);
      await vi.advanceTimersByTimeAsync(600);
      expect(lastSentScreenGroup()).toContain("#modal:a6e7cafa00f1");

      openDialog("modal-b").appendChild(div);
      setIntersecting(div, true);
      await vi.advanceTimersByTimeAsync(600);
      vi.useRealTimers();

      expect(lastSentScreenGroup()).toContain("#modal:a9e71fd27a7d");

      collector.destroy();
    });
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

    // The triggers were never subscribed, so a post-destroy registry event
    // cannot schedule a pass.
    eventBus.emit("structureChanges", [document.createElement("div")]);
    await flushMicrotasks();

    expect(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
        (url as string).includes("/v1/context/usages"),
      ),
    ).toHaveLength(0);
    // Never subscribed at all: triggers.start() is what creates the observer.
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });
});
