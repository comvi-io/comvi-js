import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { Collector } from "../src/collector/Collector";
import { CollectorTriggers } from "../src/collector/triggers";
import { collectKeyRefsForElements, enumerateVisibleTargets } from "../src/collector/enumerate";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";
import {
  MockIntersectionObserver,
  resetIntersectionObserverMock,
  setIntersecting,
} from "./intersectionObserverMock";

const SCOPE = "collector-triggers-test-scope";

function mockOkResponse<T>(payload: T): Response {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
}

function usagesResponse(): Response {
  return mockOkResponse({ updated: [], resend: [], orphanObservations: 0, hashSkew: 0 });
}

/** Every translation key sent in a POST /v1/context/usages `items[]` so far. */
function sentKeys(fetchMock: ReturnType<typeof vi.fn>): string[] {
  const keys: string[] = [];
  for (const [url, init] of fetchMock.mock.calls) {
    if (typeof url === "string" && url.includes("/v1/context/usages")) {
      const body = JSON.parse((init as RequestInit).body as string);
      for (const item of body.items ?? []) {
        keys.push(item.key);
      }
    }
  }
  return keys;
}

function registerVisible(
  registry: TranslationRegistry,
  key: string,
  rect: Partial<DOMRect> = { top: 0, left: 0, width: 100, height: 20, right: 100, bottom: 20 },
): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  mockBoundingClientRect(el, rect);
  registry.add(el, { nodes: new Map([[document.createTextNode("x"), { key, ns: "ns" }]]) });
  return el;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("collector triggers — IntersectionObserver visibility + maxWait", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiConfig(SCOPE);
    resetIntersectionObserverMock();
    cleanupDOM();
  });

  describe("CollectorTriggers unit (AC2)", () => {
    it("observes elements on translationRegistered and unobserves on translationRemoved", () => {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const el = document.createElement("div");
      registry.add(el, {
        nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
      });

      const io = MockIntersectionObserver.instances[0];
      expect(io.observed.has(el)).toBe(true);

      registry.remove(el);
      expect(io.observed.has(el)).toBe(false);

      triggers.destroy();
    });

    it("seeds already-registered elements at start() (elements registered before subscribe)", () => {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      // Registered BEFORE the triggers subscribe — mirrors domWatcher's initial
      // scan firing synchronously ahead of collector.start().
      const seeded = document.createElement("div");
      registry.add(seeded, {
        nodes: new Map([[document.createTextNode("x"), { key: "seed", ns: "ns" }]]),
      });

      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const io = MockIntersectionObserver.instances[0];
      expect(io.observed.has(seeded)).toBe(true);

      triggers.destroy();
    });

    it("never observes the editor's own shadow-host UI", () => {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const host = document.createElement("div");
      host.setAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE, "true");
      registry.add(host, {
        nodes: new Map([[document.createTextNode("x"), { key: "ui", ns: "ns" }]]),
      });

      const io = MockIntersectionObserver.instances[0];
      expect(io.observed.has(host)).toBe(false);

      triggers.destroy();
    });

    it("an IO intersection change updates the visible set and schedules a settle", () => {
      vi.useFakeTimers();
      try {
        MockIntersectionObserver.autoIntersect = false;
        const eventBus = new EventBus();
        const registry = new TranslationRegistry(eventBus);
        const onSettle = vi.fn();
        const triggers = new CollectorTriggers(eventBus, registry, onSettle);
        triggers.start();

        const el = document.createElement("div");
        registry.add(el, {
          nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
        });

        expect(triggers.getIntersectingElements().has(el)).toBe(false);

        setIntersecting(el, true);
        expect(triggers.getIntersectingElements().has(el)).toBe(true);
        expect(onSettle).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500); // maxWait ceiling
        expect(onSettle).toHaveBeenCalledTimes(1);

        setIntersecting(el, false);
        expect(triggers.getIntersectingElements().has(el)).toBe(false);

        triggers.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("disconnects the observer and clears the visible set on destroy()", () => {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const el = document.createElement("div");
      registry.add(el, {
        nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
      });
      setIntersecting(el, true);
      expect(triggers.getIntersectingElements().size).toBe(1);

      const io = MockIntersectionObserver.instances[0];
      const disconnectSpy = vi.spyOn(io, "disconnect");
      triggers.destroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      expect(triggers.getIntersectingElements().size).toBe(0);
    });

    it("a throw inside the IO callback is caught and never escapes (MED-2, RC3/P8)", () => {
      MockIntersectionObserver.autoIntersect = false;
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const el = document.createElement("div");
      registry.add(el, {
        nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
      });

      // Force a throw during the callback's Set-membership check.
      vi.spyOn(registry, "has").mockImplementation(() => {
        throw new Error("boom");
      });

      // The IO callback runs synchronously via the mock's emit — it must swallow
      // the throw (fault isolation) rather than let it reach IO's caller.
      expect(() => setIntersecting(el, true)).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();

      triggers.destroy();
    });
  });

  describe("route-change triggers (popstate + pushState/replaceState)", () => {
    it("a popstate dispatch triggers a scheduled settle", () => {
      vi.useFakeTimers();
      try {
        MockIntersectionObserver.autoIntersect = false;
        const eventBus = new EventBus();
        const registry = new TranslationRegistry(eventBus);
        const onSettle = vi.fn();
        const triggers = new CollectorTriggers(eventBus, registry, onSettle);
        triggers.start();

        window.dispatchEvent(new PopStateEvent("popstate"));
        vi.advanceTimersByTime(500); // maxWait ceiling
        expect(onSettle).toHaveBeenCalledTimes(1);

        triggers.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("pushState and replaceState calls each trigger a scheduled settle", () => {
      vi.useFakeTimers();
      try {
        MockIntersectionObserver.autoIntersect = false;
        const eventBus = new EventBus();
        const registry = new TranslationRegistry(eventBus);
        const onSettle = vi.fn();
        const triggers = new CollectorTriggers(eventBus, registry, onSettle);
        triggers.start();

        window.history.pushState({}, "", "/a");
        vi.advanceTimersByTime(500);
        expect(onSettle).toHaveBeenCalledTimes(1);

        window.history.replaceState({}, "", "/b");
        vi.advanceTimersByTime(500);
        expect(onSettle).toHaveBeenCalledTimes(2);

        triggers.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("destroy() restores the original pushState/replaceState when nothing else re-wrapped them", () => {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);

      // Spy on the pre-patch functions to prove destroy() delegates back to
      // them functionally — ensureHistoryPatched rebinds a fresh `.bind()`
      // wrapper on every patch cycle, so reference equality across a
      // patch/restore round-trip isn't meaningful; behavior is.
      const nativePushState = window.history.pushState.bind(window.history);
      const nativeReplaceState = window.history.replaceState.bind(window.history);
      const pushSpy = vi.fn(nativePushState);
      const replaceSpy = vi.fn(nativeReplaceState);
      window.history.pushState = pushSpy as History["pushState"];
      window.history.replaceState = replaceSpy as History["replaceState"];

      try {
        triggers.start();
        expect(window.history.pushState).not.toBe(pushSpy);
        expect(window.history.replaceState).not.toBe(replaceSpy);

        triggers.destroy();

        window.history.pushState({}, "", "/after-destroy-push");
        window.history.replaceState({}, "", "/after-destroy-replace");

        // Restored functions delegate through to the pre-patch ones...
        expect(pushSpy).toHaveBeenCalledTimes(1);
        expect(replaceSpy).toHaveBeenCalledTimes(1);
        expect(location.pathname).toBe("/after-destroy-replace");
        // ...and no longer notify our (unsubscribed) route-change listener.
        expect(onSettle).not.toHaveBeenCalled();
      } finally {
        window.history.pushState = nativePushState;
        window.history.replaceState = nativeReplaceState;
      }
    });

    it("MED-3: a host router that re-wraps pushState AFTER us is left in place on destroy(), and navigation still works", () => {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      const trueOriginalPushState = window.history.pushState;

      try {
        triggers.start(); // our patch is in place

        // Simulate a host-app router patching pushState AFTER the collector did.
        const ourPushState = window.history.pushState;
        const hostRouterWrapper = vi.fn(function (
          this: History,
          ...args: Parameters<History["pushState"]>
        ) {
          return ourPushState.apply(this, args);
        }) as unknown as History["pushState"];
        window.history.pushState = hostRouterWrapper;

        triggers.destroy();

        // Our restore must NOT clobber the host's wrapper — it delegates to our
        // patch, which in turn delegates to the true original, so the chain
        // still works; stomping it here would break the host's navigation.
        expect(window.history.pushState).toBe(hostRouterWrapper);

        window.history.pushState({}, "", "/still-works");
        expect(hostRouterWrapper).toHaveBeenCalledTimes(1);
        expect(location.pathname).toBe("/still-works");
      } finally {
        window.history.pushState = trueOriginalPushState;
      }
    });
  });

  describe("enumerate restriction & null-safety (AC9)", () => {
    it("collectKeyRefsForElements skips elements no longer in the registry without throwing", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const present = document.createElement("div");
      registry.add(present, {
        nodes: new Map([[document.createTextNode("x"), { key: "present", ns: "ns" }]]),
      });
      // `stale` was intersecting per IO but has since been removed from the
      // registry — get(stale) === undefined. It must be skipped, not dereferenced.
      const stale = document.createElement("div");

      const set = new Set<Element>([present, stale]);
      let refs: ReturnType<typeof collectKeyRefsForElements>;
      expect(() => {
        refs = collectKeyRefsForElements(registry, set);
      }).not.toThrow();

      expect(refs!).toEqual([{ namespace: "ns", key: "present" }]);
    });

    it("enumerateVisibleTargets restricts measurement to the provided set (no getBoundingClientRect over the rest)", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const inSet = registerVisible(registry, "in.set");
      const notInSet = registerVisible(registry, "not.in.set", {
        top: 40,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 60,
      });

      const inSetSpy = vi.spyOn(inSet, "getBoundingClientRect");
      const notInSetSpy = vi.spyOn(notInSet, "getBoundingClientRect");

      const targets = enumerateVisibleTargets(registry, new Set<Element>([inSet]));

      expect(targets.map((t) => t.key)).toEqual(["in.set"]);
      expect(inSetSpy).toHaveBeenCalled();
      // The whole point of the restriction: elements outside the IO set are
      // never measured, so rect reads scale with visible count, not registry size.
      expect(notInSetSpy).not.toHaveBeenCalled();
    });

    it("enumerateVisibleTargets drops an IO-intersecting element that its own viewport check filters out", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      // IO reports it intersecting, but enumerate's isViewportIntersecting sees
      // an off-screen rect (e.g. clipped by a scrolled-out overflow container).
      const clipped = registerVisible(registry, "clipped", {
        top: -500,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: -480,
      });

      const targets = enumerateVisibleTargets(registry, new Set<Element>([clipped]));
      expect(targets).toHaveLength(0);
    });
  });

  describe("Collector integration", () => {
    it("AC8: cold load with only static above-the-fold content sends it via the seed (auto-intersect)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      registerVisible(registry, "above.fold");

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start(); // seed observes -> auto-intersect -> sync pass sends
      await flushMicrotasks();

      expect(sentKeys(fetchMock)).toContain("above.fold");
      collector.destroy();
    });

    it("AC8: the synchronous start pass sees an empty IO set and is recovered by the first IO settle", async () => {
      MockIntersectionObserver.autoIntersect = false; // model real async IO
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const above = registerVisible(registry, "above.fold");

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start(); // IO empty here -> nothing sent yet
      await flushMicrotasks();
      expect(sentKeys(fetchMock)).not.toContain("above.fold");

      vi.useFakeTimers();
      try {
        setIntersecting(above, true); // first IO settle recovers the seed
        await vi.advanceTimersByTimeAsync(600);
      } finally {
        vi.useRealTimers();
      }

      expect(sentKeys(fetchMock)).toContain("above.fold");
      collector.destroy();
    });

    it("AC1: scrolling a static below-the-fold element into view triggers a pass that includes it", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const above = registerVisible(registry, "above.fold");
      // Static, already-mounted, but below the fold (no DOM mutation on scroll).
      const below = registerVisible(registry, "below.fold", {
        top: 2000,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 2020,
      });

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      try {
        // First paint: only the above-the-fold element intersects.
        setIntersecting(above, true);
        await vi.advanceTimersByTimeAsync(600);
        expect(sentKeys(fetchMock)).toContain("above.fold");
        expect(sentKeys(fetchMock)).not.toContain("below.fold");

        // Scroll reveals `below`: it now intersects and its rect is on-screen.
        mockBoundingClientRect(below, {
          top: 10,
          left: 0,
          width: 100,
          height: 20,
          right: 100,
          bottom: 30,
        });
        setIntersecting(below, true);
        await vi.advanceTimersByTimeAsync(600);
      } finally {
        vi.useRealTimers();
      }

      expect(sentKeys(fetchMock)).toContain("below.fold");
      collector.destroy();
    });

    it("AC3: an IO settle with an unchanged visible key-set sends no further batch", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const above = registerVisible(registry, "above.fold");

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      try {
        setIntersecting(above, true);
        await vi.advanceTimersByTimeAsync(600);
        const callsAfterReveal = fetchMock.mock.calls.length;
        expect(callsAfterReveal).toBeGreaterThan(0);

        // A redundant IO settle (same element, still intersecting) — the
        // visible key-set is unchanged, so the pre-gate short-circuits.
        setIntersecting(above, true);
        await vi.advanceTimersByTimeAsync(600);
        expect(fetchMock.mock.calls.length).toBe(callsAfterReveal);
      } finally {
        vi.useRealTimers();
      }

      collector.destroy();
    });

    it("AC9: an IO-intersecting element that enumerate filters out proceeds without a bad send", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      // IO will say it's intersecting, but the rect is off-screen.
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
      try {
        setIntersecting(clipped, true);
        await vi.advanceTimersByTimeAsync(600);
      } finally {
        vi.useRealTimers();
      }

      // enumerate's own viewport check dropped it — never sent, no duplicate.
      expect(sentKeys(fetchMock)).not.toContain("clipped.key");
      collector.destroy();
    });

    it("AC5: an aligned-burst short-lived element still registered at the maxWait pass is captured", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      try {
        // Loader mounts at burst start.
        const loader = registerVisible(registry, "loading");
        setIntersecting(loader, true); // t=0: arms trailing(1000) + maxWait(500)

        // Sustained mutations keep pushing the 1000ms trailing debounce out, so
        // WITHOUT maxWait no pass would fire until t=1000+.
        await vi.advanceTimersByTimeAsync(100); // t=100
        eventBus.emit("structureChanges", [document.body]);
        await vi.advanceTimersByTimeAsync(100); // t=200
        eventBus.emit("structureChanges", [document.body]);
        expect(sentKeys(fetchMock)).not.toContain("loading"); // no pass yet (t<500)

        await vi.advanceTimersByTimeAsync(350); // t=550: maxWait ceiling hit
        // Loader is still registered here, so the bounded pass captures it.
        expect(sentKeys(fetchMock)).toContain("loading");
      } finally {
        vi.useRealTimers();
      }

      collector.destroy();
    });

    it("AC5: a misaligned short-lived element removed before the maxWait pass is an accepted miss", async () => {
      MockIntersectionObserver.autoIntersect = false;
      const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
      vi.stubGlobal("fetch", fetchMock);

      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
      await collector.start();
      await flushMicrotasks();

      vi.useFakeTimers();
      try {
        const loader = registerVisible(registry, "loading.transient");
        setIntersecting(loader, true); // t=0
        await vi.advanceTimersByTimeAsync(100); // t=100
        // Removed before the maxWait pass at t=500 — synchronous registry
        // cleanup also unobserves it, so it is gone from the visible set.
        registry.remove(loader);
        await vi.advanceTimersByTimeAsync(600); // t=700: through the t=500 maxWait
      } finally {
        vi.useRealTimers();
      }

      expect(sentKeys(fetchMock)).not.toContain("loading.transient");
      collector.destroy();
    });
  });
});
