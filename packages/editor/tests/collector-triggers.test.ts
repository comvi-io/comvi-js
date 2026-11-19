import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { Collector } from "../src/collector/Collector";
import { CollectorTriggers } from "../src/collector/triggers";
import { collectKeyRefsForElements, enumerateVisibleTargets } from "../src/collector/enumerate";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { mockBoundingClientRect, cleanupDOM, flushMicrotasks, registerVisible } from "./helpers";
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

/** Triggers a test started, destroyed after it so none outlives the test (destroy is idempotent). */
const liveTriggers: CollectorTriggers[] = [];

/** A started CollectorTriggers over a fresh bus and registry. */
function startTriggers(onSettle: () => void = vi.fn()) {
  const eventBus = new EventBus();
  const registry = new TranslationRegistry(eventBus);
  const triggers = new CollectorTriggers(eventBus, registry, onSettle);
  liveTriggers.push(triggers);
  triggers.start();
  return { eventBus, registry, triggers, onSettle };
}

/** Registers a fresh element with one translation node. */
function addRegistered(registry: TranslationRegistry): HTMLElement {
  const el = document.createElement("div");
  registry.add(el, {
    nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
  });
  return el;
}

/** A started Collector over `registry`, with fetch stubbed to accept every usages post. */
async function startCollector(registry: TranslationRegistry, eventBus: EventBus) {
  const fetchMock = vi.fn().mockResolvedValue(usagesResponse());
  vi.stubGlobal("fetch", fetchMock);
  const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
  liveCollectors.push(collector);
  await collector.start();
  await flushMicrotasks();
  return fetchMock;
}

const liveCollectors: Collector[] = [];

describe("collector triggers — IntersectionObserver visibility + maxWait", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
  });

  afterEach(() => {
    for (const triggers of liveTriggers.splice(0)) triggers.destroy();
    for (const collector of liveCollectors.splice(0)) collector.destroy();
    vi.useRealTimers();
    // pushState/replaceState navigate the shared `location`; leaving it on a
    // test route would make any later screenGroup assertion order-dependent.
    window.history.replaceState({}, "", "/");
    resetApiConfig(SCOPE);
    resetIntersectionObserverMock();
    cleanupDOM();
  });

  describe("CollectorTriggers unit (AC2)", () => {
    beforeEach(() => {
      MockIntersectionObserver.autoIntersect = false;
    });

    it("translationRegistered → the element is observed by the IntersectionObserver", () => {
      const { registry } = startTriggers();

      const el = addRegistered(registry);

      expect(MockIntersectionObserver.instances[0]!.observed.has(el)).toBe(true);
    });

    it("translationRemoved → the element is no longer observed", () => {
      const { registry } = startTriggers();
      const el = addRegistered(registry);

      registry.remove(el);

      expect(MockIntersectionObserver.instances[0]!.observed.has(el)).toBe(false);
    });

    it("seeds already-registered elements at start() (elements registered before subscribe)", () => {
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

    it("registered element IO has not reported yet → not in the visible set", () => {
      const { registry, triggers } = startTriggers();

      const el = addRegistered(registry);

      expect(triggers.getIntersectingElements().has(el)).toBe(false);
    });

    it("IO reports the element intersecting → it joins the visible set", () => {
      const { registry, triggers } = startTriggers();
      const el = addRegistered(registry);

      setIntersecting(el, true);

      expect(triggers.getIntersectingElements().has(el)).toBe(true);
    });

    it("IO intersection change → no settle before the maxWait ceiling", () => {
      vi.useFakeTimers();
      const { registry, onSettle } = startTriggers(vi.fn());
      const el = addRegistered(registry);

      setIntersecting(el, true);

      expect(onSettle).not.toHaveBeenCalled();
    });

    it("IO intersection change, 500ms maxWait ceiling elapses → one settle", () => {
      vi.useFakeTimers();
      const { registry, onSettle } = startTriggers(vi.fn());
      const el = addRegistered(registry);
      setIntersecting(el, true);

      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);
    });

    it("IO reports a visible element no longer intersecting → it leaves the visible set", () => {
      const { registry, triggers } = startTriggers();
      const el = addRegistered(registry);
      setIntersecting(el, true);

      setIntersecting(el, false);

      expect(triggers.getIntersectingElements().has(el)).toBe(false);
    });

    it("destroy() → the IntersectionObserver is disconnected once", () => {
      const { registry, triggers } = startTriggers();
      setIntersecting(addRegistered(registry), true);
      const disconnectSpy = vi.spyOn(MockIntersectionObserver.instances[0]!, "disconnect");

      triggers.destroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    it("destroy() with one visible element → the visible set is cleared", () => {
      const { registry, triggers } = startTriggers();
      setIntersecting(addRegistered(registry), true);

      triggers.destroy();

      expect(triggers.getIntersectingElements().size).toBe(0);
    });

    it.each([
      ["initialScan", (bus: EventBus) => bus.emit("initialScan", document.body)],
      ["structureChanges", (bus: EventBus) => bus.emit("structureChanges", [document.body])],
      ["textChanges", (bus: EventBus) => bus.emit("textChanges", [document.createTextNode("x")])],
      ["attributeChanges", (bus: EventBus) => bus.emit("attributeChanges", [document.body])],
      ["nodesRemoved", (bus: EventBus) => bus.emit("nodesRemoved", [document.body])],
      [
        "translationUpdated",
        (bus: EventBus) =>
          bus.emit("translationUpdated", document.body, {
            nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
          }),
      ],
    ])("schedules a settle on the %s event", (_name, emit) => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);
      triggers.start();

      emit(eventBus);
      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);

      triggers.destroy();
    });

    it("a window resize triggers a scheduled settle (responsive width drift)", () => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);
      triggers.start();

      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);

      triggers.destroy();
    });

    it("start() is idempotent — a second call creates no second observer", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());

      triggers.start();
      triggers.start();

      expect(MockIntersectionObserver.instances).toHaveLength(1);

      triggers.destroy();
    });

    it("start() after destroy() → a structure change settles again", () => {
      vi.useFakeTimers();
      const { eventBus, triggers, onSettle } = startTriggers(vi.fn());
      triggers.destroy();
      triggers.start();

      eventBus.emit("structureChanges", [document.body]);
      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);
    });

    it("destroy() on already-destroyed triggers → does not throw", () => {
      const { triggers } = startTriggers();
      triggers.destroy();

      expect(() => triggers.destroy()).not.toThrow();
    });

    it("cancels a settle that was already pending when destroy() ran", () => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);
      triggers.start();

      eventBus.emit("structureChanges", [document.body]);
      triggers.destroy();
      vi.advanceTimersByTime(1100);

      expect(onSettle).not.toHaveBeenCalled();
    });

    it("visible element removed from the registry → it leaves the intersecting set", () => {
      const { registry, triggers } = startTriggers();
      const el = addRegistered(registry);
      setIntersecting(el, true);

      registry.remove(el);

      expect(triggers.getIntersectingElements().size).toBe(0);
    });

    it("a throw inside the IO callback is caught and never escapes (MED-2, RC3/P8)", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const el = document.createElement("div");
      registry.add(el, {
        nodes: new Map([[document.createTextNode("x"), { key: "k", ns: "ns" }]]),
      });

      vi.spyOn(registry, "has").mockImplementation(() => {
        throw new Error("boom");
      });

      // The IO callback runs synchronously via the mock's emit — it must swallow
      // the throw (fault isolation) rather than let it reach IO's caller.
      expect(() => setIntersecting(el, true)).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[@comvi/plugin-in-context-editor]"),
        expect.any(Error),
      );

      triggers.destroy();
    });
  });

  describe("without IntersectionObserver (SSR / very old engines)", () => {
    beforeEach(() => {
      vi.stubGlobal("IntersectionObserver", undefined);
    });

    it("no IntersectionObserver, start() → does not throw", () => {
      const eventBus = new EventBus();
      const triggers = new CollectorTriggers(eventBus, new TranslationRegistry(eventBus), vi.fn());
      liveTriggers.push(triggers);

      expect(() => triggers.start()).not.toThrow();
    });

    it("no IntersectionObserver, element registered then removed → nothing collected and no error logged", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { registry, triggers } = startTriggers();
      const el = addRegistered(registry);

      registry.remove(el);

      expect({
        visible: triggers.getIntersectingElements().size,
        errors: errorSpy.mock.calls.length,
      }).toEqual({ visible: 0, errors: 0 });
    });

    it("no IntersectionObserver, destroy() → does not throw", () => {
      const { triggers } = startTriggers();

      expect(() => triggers.destroy()).not.toThrow();
    });
  });

  describe("route-change triggers (popstate + pushState/replaceState)", () => {
    beforeEach(() => {
      MockIntersectionObserver.autoIntersect = false;
    });

    it("a popstate dispatch triggers a scheduled settle", () => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);
      triggers.start();

      window.dispatchEvent(new PopStateEvent("popstate"));
      vi.advanceTimersByTime(500); // maxWait ceiling
      expect(onSettle).toHaveBeenCalledTimes(1);

      triggers.destroy();
    });

    it("pushState call → one scheduled settle", () => {
      vi.useFakeTimers();
      const { onSettle } = startTriggers(vi.fn());

      window.history.pushState({}, "", "/a");
      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);
    });

    it("replaceState call → one scheduled settle", () => {
      vi.useFakeTimers();
      const { onSettle } = startTriggers(vi.fn());

      window.history.replaceState({}, "", "/b");
      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);
    });

    it("a hashchange dispatch triggers a scheduled settle", () => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);
      triggers.start();

      window.dispatchEvent(new Event("hashchange"));
      vi.advanceTimersByTime(500);

      expect(onSettle).toHaveBeenCalledTimes(1);

      triggers.destroy();
    });

    it.each([
      ["popstate", () => new PopStateEvent("popstate")],
      ["hashchange", () => new Event("hashchange")],
      ["resize", () => new Event("resize")],
    ])("stops scheduling settles on %s once destroyed", (_label, makeEvent) => {
      vi.useFakeTimers();
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const onSettle = vi.fn();
      const triggers = new CollectorTriggers(eventBus, registry, onSettle);
      triggers.start();

      triggers.destroy();
      window.dispatchEvent(makeEvent());
      vi.advanceTimersByTime(1100);

      expect(onSettle).not.toHaveBeenCalled();
    });

    it("destroy() takes our pushState/replaceState patch back off window.history", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const triggers = new CollectorTriggers(eventBus, registry, vi.fn());
      triggers.start();

      const patchedPushState = window.history.pushState;
      const patchedReplaceState = window.history.replaceState;

      triggers.destroy();

      expect(window.history.pushState).not.toBe(patchedPushState);
      expect(window.history.replaceState).not.toBe(patchedReplaceState);
    });

    it("keeps the history patch while another CollectorTriggers instance is still subscribed", () => {
      vi.useFakeTimers();
      const busA = new EventBus();
      const busB = new EventBus();
      const onSettleB = vi.fn();
      const first = new CollectorTriggers(busA, new TranslationRegistry(busA), vi.fn());
      const second = new CollectorTriggers(busB, new TranslationRegistry(busB), onSettleB);
      first.start();
      second.start();

      first.destroy();
      window.history.pushState({}, "", "/still-observed");
      vi.advanceTimersByTime(500);

      expect(onSettleB).toHaveBeenCalledTimes(1);

      second.destroy();
    });

    describe("with pre-patch history functions spied", () => {
      // Spies on the pre-patch functions prove destroy() delegates back to
      // them functionally — ensureHistoryPatched rebinds a fresh `.bind()`
      // wrapper on every patch cycle, so reference equality across a
      // patch/restore round-trip isn't meaningful; behavior is.
      let nativePushState: History["pushState"];
      let nativeReplaceState: History["replaceState"];
      let pushSpy: ReturnType<typeof vi.fn>;
      let replaceSpy: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        nativePushState = window.history.pushState.bind(window.history);
        nativeReplaceState = window.history.replaceState.bind(window.history);
        pushSpy = vi.fn(nativePushState);
        replaceSpy = vi.fn(nativeReplaceState);
        // Plain assignment, not vi.spyOn: ensureHistoryPatched detects an
        // already-patched history, so a spy wrapper would suppress the patch
        // this test is about — and restoreMocks cannot undo an assignment.
        window.history.pushState = pushSpy as History["pushState"];
        window.history.replaceState = replaceSpy as History["replaceState"];
      });

      afterEach(() => {
        for (const triggers of liveTriggers.splice(0)) triggers.destroy();
        window.history.pushState = nativePushState;
        window.history.replaceState = nativeReplaceState;
      });

      it("start() → pushState and replaceState are replaced by the route-change patch", () => {
        const eventBus = new EventBus();
        const triggers = new CollectorTriggers(
          eventBus,
          new TranslationRegistry(eventBus),
          vi.fn(),
        );
        liveTriggers.push(triggers);

        triggers.start();

        expect({
          pushPatched: window.history.pushState !== pushSpy,
          replacePatched: window.history.replaceState !== replaceSpy,
        }).toEqual({ pushPatched: true, replacePatched: true });
      });

      it("destroy() with nothing re-wrapping history → navigation reaches the original functions", () => {
        const { triggers } = startTriggers();
        triggers.destroy();

        window.history.pushState({}, "", "/after-destroy-push");
        window.history.replaceState({}, "", "/after-destroy-replace");

        expect({
          push: pushSpy.mock.calls.length,
          replace: replaceSpy.mock.calls.length,
          pathname: location.pathname,
        }).toEqual({ push: 1, replace: 1, pathname: "/after-destroy-replace" });
      });

      it("destroy() with nothing re-wrapping history → navigation no longer schedules a settle", () => {
        const { triggers, onSettle } = startTriggers(vi.fn());
        triggers.destroy();

        window.history.pushState({}, "", "/after-destroy-push");
        window.history.replaceState({}, "", "/after-destroy-replace");

        expect(onSettle).not.toHaveBeenCalled();
      });
    });

    describe("MED-3: a host router that re-wraps history AFTER us", () => {
      let trueOriginalPushState: History["pushState"];
      let trueOriginalReplaceState: History["replaceState"];

      beforeEach(() => {
        trueOriginalPushState = window.history.pushState;
        trueOriginalReplaceState = window.history.replaceState;
      });

      afterEach(() => {
        for (const triggers of liveTriggers.splice(0)) triggers.destroy();
        // Not a vi.spyOn: the wrapper is installed by assignment to model a
        // host router, so restoreMocks cannot undo it.
        window.history.pushState = trueOriginalPushState;
        window.history.replaceState = trueOriginalReplaceState;
      });

      /** Starts triggers, then installs a host-router wrapper over our patched `method`. */
      function startThenHostWraps(method: "pushState" | "replaceState") {
        const { triggers } = startTriggers();
        const ours = window.history[method];
        const hostRouterWrapper = vi.fn(function (
          this: History,
          ...args: Parameters<History["pushState"]>
        ) {
          return ours.apply(this, args);
        });
        window.history[method] = hostRouterWrapper as unknown as History["pushState"];
        return { triggers, hostRouterWrapper };
      }

      it.each(["pushState", "replaceState"] as const)(
        "host wrapped %s after us, destroy() → the host wrapper is left in place",
        (method) => {
          const { triggers, hostRouterWrapper } = startThenHostWraps(method);

          triggers.destroy();

          // Our restore must NOT clobber the host's wrapper — it delegates to our
          // patch, which in turn delegates to the true original, so the chain
          // still works; stomping it here would break the host's navigation.
          expect(window.history[method]).toBe(hostRouterWrapper);
        },
      );

      it.each(["pushState", "replaceState"] as const)(
        "host wrapped %s after us, destroyed → navigating through the wrapper still works",
        (method) => {
          const { triggers, hostRouterWrapper } = startThenHostWraps(method);
          triggers.destroy();

          window.history[method]({}, "", "/still-works");

          expect({
            wrapperCalls: hostRouterWrapper.mock.calls.length,
            pathname: location.pathname,
          }).toEqual({ wrapperCalls: 1, pathname: "/still-works" });
        },
      );
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

      const refs = collectKeyRefsForElements(registry, new Set<Element>([present, stale]));

      expect(refs).toEqual([{ namespace: "ns", key: "present" }]);
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

    it("AC8: start pass while the IO set is still empty → the above-the-fold key is not sent yet", async () => {
      MockIntersectionObserver.autoIntersect = false; // model real async IO
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      registerVisible(registry, "above.fold");

      const fetchMock = await startCollector(registry, eventBus);

      expect(sentKeys(fetchMock)).not.toContain("above.fold");
    });

    it("AC8: first IO settle after an empty start pass → the above-the-fold key is sent", async () => {
      MockIntersectionObserver.autoIntersect = false; // model real async IO
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const above = registerVisible(registry, "above.fold");
      const fetchMock = await startCollector(registry, eventBus);
      vi.useFakeTimers();

      setIntersecting(above, true); // first IO settle recovers the seed
      await vi.advanceTimersByTimeAsync(600);

      expect(sentKeys(fetchMock)).toContain("above.fold");
    });

    /** A collector over one above-the-fold and one static below-the-fold element, IO not yet reporting. */
    async function aboveAndBelowFold() {
      MockIntersectionObserver.autoIntersect = false;
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
      const fetchMock = await startCollector(registry, eventBus);
      vi.useFakeTimers();
      return { above, below, fetchMock };
    }

    it("AC1: first paint with only the above-the-fold element intersecting → it is sent, the below-the-fold one is not", async () => {
      const { above, fetchMock } = await aboveAndBelowFold();

      setIntersecting(above, true);
      await vi.advanceTimersByTimeAsync(600);

      expect({
        above: sentKeys(fetchMock).includes("above.fold"),
        below: sentKeys(fetchMock).includes("below.fold"),
      }).toEqual({ above: true, below: false });
    });

    it("AC1: scrolling a static below-the-fold element into view → a pass includes it", async () => {
      const { above, below, fetchMock } = await aboveAndBelowFold();
      setIntersecting(above, true);
      await vi.advanceTimersByTimeAsync(600);

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

      expect(sentKeys(fetchMock)).toContain("below.fold");
    });

    /** A collector over one above-the-fold element, IO not yet reporting. */
    async function aboveFoldOnly() {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const above = registerVisible(registry, "above.fold");
      const fetchMock = await startCollector(registry, eventBus);
      vi.useFakeTimers();
      return { above, fetchMock };
    }

    it("AC3: IO reveals the element → the handshake plus exactly one pass reach the network", async () => {
      const { above, fetchMock } = await aboveFoldOnly();

      setIntersecting(above, true);
      await vi.advanceTimersByTimeAsync(600);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("AC3: an IO settle with an unchanged visible key-set → no further batch", async () => {
      const { above, fetchMock } = await aboveFoldOnly();
      setIntersecting(above, true);
      await vi.advanceTimersByTimeAsync(600);

      // A redundant IO settle (same element, still intersecting) — the
      // visible key-set is unchanged, so the pre-gate short-circuits.
      setIntersecting(above, true);
      await vi.advanceTimersByTimeAsync(600);

      expect(fetchMock).toHaveBeenCalledTimes(2);
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
      setIntersecting(clipped, true);
      await vi.advanceTimersByTimeAsync(600);

      // enumerate's own viewport check dropped it — never sent, no duplicate.
      expect(sentKeys(fetchMock)).not.toContain("clipped.key");
      collector.destroy();
    });

    /**
     * A loader mounted at burst start (t=0, arming trailing 1000 + maxWait 500),
     * then sustained mutations at t=100 and t=200 that keep pushing the 1000ms
     * trailing debounce out, so WITHOUT maxWait no pass would fire until t=1000+.
     */
    async function loaderUnderSustainedMutations() {
      MockIntersectionObserver.autoIntersect = false;
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      const fetchMock = await startCollector(registry, eventBus);
      vi.useFakeTimers();
      const loader = registerVisible(registry, "loading");
      setIntersecting(loader, true);
      return { eventBus, fetchMock };
    }

    it("AC5: sustained mutations for 200ms after a loader mounts → no pass has sent it yet", async () => {
      const { eventBus, fetchMock } = await loaderUnderSustainedMutations();

      await vi.advanceTimersByTimeAsync(100); // t=100
      eventBus.emit("structureChanges", [document.body]);
      await vi.advanceTimersByTimeAsync(100); // t=200
      eventBus.emit("structureChanges", [document.body]);

      expect(sentKeys(fetchMock)).not.toContain("loading");
    });

    it("AC5: an aligned-burst short-lived element still registered at the maxWait pass → captured", async () => {
      const { eventBus, fetchMock } = await loaderUnderSustainedMutations();
      await vi.advanceTimersByTimeAsync(100); // t=100
      eventBus.emit("structureChanges", [document.body]);
      await vi.advanceTimersByTimeAsync(100); // t=200
      eventBus.emit("structureChanges", [document.body]);

      await vi.advanceTimersByTimeAsync(350); // t=550: maxWait ceiling hit

      // Loader is still registered here, so the bounded pass captures it.
      expect(sentKeys(fetchMock)).toContain("loading");
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
      const loader = registerVisible(registry, "loading.transient");
      setIntersecting(loader, true); // t=0
      await vi.advanceTimersByTimeAsync(100); // t=100
      // Removed before the maxWait pass at t=500 — synchronous registry
      // cleanup also unobserves it, so it is gone from the visible set.
      registry.remove(loader);
      await vi.advanceTimersByTimeAsync(600); // t=700: through the t=500 maxWait

      expect(sentKeys(fetchMock)).not.toContain("loading.transient");
      collector.destroy();
    });
  });
});
