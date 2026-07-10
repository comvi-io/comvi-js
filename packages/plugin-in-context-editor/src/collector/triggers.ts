/**
 * Triggers (2c) — decides WHEN to attempt a pass: subscribes to the existing
 * DOMWatcher/EventBus events (DOMWatcher itself has no debounce, C9) plus
 * route-change signals (popstate + wrapped pushState/replaceState). The settle
 * is implemented as a trailing debounce (`SETTLE_DEBOUNCE_MS`, 1s) bounded by
 * a `maxWait` ceiling (`SETTLE_MAX_WAIT_MS`, 500ms), but because the ceiling is
 * smaller than the trailing delay it ALWAYS elapses first: effective behavior
 * is a flat ~500ms throttle from the FIRST trigger of a burst, and the 1s
 * trailing edge never actually fires. The visible-set gate (whether the pass
 * is actually worth sending) lives in the caller (`gate.ts`) — triggers only
 * decide timing.
 *
 * This class also OWNS the collector's visibility source of truth: an
 * `IntersectionObserver` fed by the existing `translationRegistered` /
 * `translationRemoved` events (mirroring `ElementHighlighter`'s wiring) whose
 * intersecting `Set<Element>` is the single answer to "what's on screen". A
 * scroll that reveals a static, already-mounted element crosses no DOM
 * mutation, so IO is the only trigger that catches it. The IO callback reads
 * `entry.isIntersecting` + `entry.target` ONLY — never a rect — so no
 * measurement happens outside the gated pass.
 *
 * History patching uses a shared, ref-counted module-level patch (mirroring
 * DOMWatcher's `attachShadow` patch) so multiple Core/Collector instances on
 * the same page compose safely instead of clobbering each other's restore.
 */

import type { EventBus } from "../EventBus";
import type { TranslationRegistry } from "../TranslationRegistry";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../constants";
import { debounce, type DebouncedFunction } from "../utils/debounce";

/**
 * Trailing edge of the settle debounce. NOTE: this is effectively inert —
 * `SETTLE_MAX_WAIT_MS` (500ms) is smaller and is armed on the same first
 * trigger, so the ceiling always fires and clears this timer first. Raising
 * this value alone changes nothing observable; see `SETTLE_MAX_WAIT_MS` for
 * the knob that actually controls cadence.
 */
const SETTLE_DEBOUNCE_MS = 1000;
/**
 * Ceiling on how long the settle may defer — and, in practice, the ONLY knob
 * that sets the settle cadence (see `SETTLE_DEBOUNCE_MS` above). Because it is
 * smaller than the trailing debounce, a burst always produces one pass at
 * ~500ms after its FIRST trigger, catching short-lived elements (loaders)
 * that synchronous registry cleanup would otherwise delete before a 1s
 * trailing pass could measure them. This deliberately trades a lower
 * short-lived hit-rate (misses <500ms loaders) for far fewer passes — each
 * pass runs computeScreenGroup's querySelectorAll+getComputedStyle before the
 * pre-gate, so halving the cadence vs 250ms materially cuts churn cost (PO
 * anti-churn constraint). Residual is burst-alignment-dependent (not a clean
 * per-element floor) — sub-window lifetimes remain an accepted miss.
 */
const SETTLE_MAX_WAIT_MS = 500;

type RouteChangeListener = () => void;

const routeChangeListeners = new Set<RouteChangeListener>();
let restoreHistoryPatch: (() => void) | null = null;

function ensureHistoryPatched(): void {
  if (
    restoreHistoryPatch ||
    typeof window === "undefined" ||
    typeof window.history?.pushState !== "function"
  ) {
    return;
  }

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  const notify = (): void => {
    routeChangeListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Never let a subscriber crash the host app's navigation.
      }
    });
  };

  const patchedPushState = function patchedPushState(
    this: History,
    ...args: Parameters<History["pushState"]>
  ) {
    originalPushState(...args);
    notify();
  } as History["pushState"];

  const patchedReplaceState = function patchedReplaceState(
    this: History,
    ...args: Parameters<History["replaceState"]>
  ) {
    originalReplaceState(...args);
    notify();
  } as History["replaceState"];

  window.history.pushState = patchedPushState;
  window.history.replaceState = patchedReplaceState;

  restoreHistoryPatch = () => {
    // Guard against clobbering a host-app router that patched pushState/
    // replaceState AFTER us: if the current value is no longer OUR patched
    // function, something re-wrapped it (our patch delegates to the original,
    // so it's still in that chain) — restoring to our saved original here
    // would stomp the host's wrapper and break its navigation. Skip that
    // restore and leave the current chain intact; only restore the ones still
    // pointing at our patch.
    if (window.history.pushState === patchedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === patchedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
}

function subscribeToRouteChanges(listener: RouteChangeListener): () => void {
  routeChangeListeners.add(listener);
  ensureHistoryPatched();
  window.addEventListener("popstate", listener);

  return () => {
    routeChangeListeners.delete(listener);
    window.removeEventListener("popstate", listener);
    if (routeChangeListeners.size === 0 && restoreHistoryPatch) {
      restoreHistoryPatch();
      restoreHistoryPatch = null;
    }
  };
}

export class CollectorTriggers {
  private unsubscribers: (() => void)[] = [];
  private readonly debounced: DebouncedFunction<() => void>;
  private started = false;
  private observer: IntersectionObserver | null = null;
  /** Registered elements IO currently reports as intersecting — the single visibility source of truth. */
  private readonly visibleElements = new Set<Element>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly registry: TranslationRegistry,
    onSettle: () => void,
  ) {
    this.debounced = debounce(onSettle, SETTLE_DEBOUNCE_MS, { maxWait: SETTLE_MAX_WAIT_MS });
  }

  /**
   * The currently-intersecting registered elements — the single source of
   * truth for what is on screen. Callers must treat this as read-only; it is
   * the live set the IO callback mutates.
   */
  public getIntersectingElements(): ReadonlySet<Element> {
    return this.visibleElements;
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.setupIntersectionObserver();

    this.unsubscribers.push(this.eventBus.on("initialScan", this.schedule));
    this.unsubscribers.push(this.eventBus.on("structureChanges", this.schedule));
    this.unsubscribers.push(this.eventBus.on("textChanges", this.schedule));
    this.unsubscribers.push(this.eventBus.on("nodesRemoved", this.schedule));

    // Visibility source of truth: observe/unobserve as elements enter/leave
    // the registry (mirrors ElementHighlighter's register/remove wiring).
    this.unsubscribers.push(this.eventBus.on("translationRegistered", this.handleRegistered));
    this.unsubscribers.push(this.eventBus.on("translationRemoved", this.handleRemoved));

    // SEED (critical): the initial DOM scan emitted `translationRegistered`
    // synchronously in domWatcher.start(), BEFORE collector.start() (deferred
    // behind the handshake await) got here to subscribe — so those elements
    // never re-fire the event. Observe the already-registered ones now; without
    // this, ALL initial above-the-fold content is silently never collected.
    for (const element of this.registry.getElements()) {
      this.observe(element);
    }

    if (typeof window !== "undefined") {
      this.unsubscribers.push(subscribeToRouteChanges(this.schedule));
    }
  }

  public destroy(): void {
    if (!this.started) {
      return;
    }
    this.started = false;

    this.debounced.cancel();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.visibleElements.clear();
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === "undefined") {
      // ADR: IntersectionObserver is the SINGLE visibility source of truth and
      // is universally available in the browsers the ICE editor targets. Where
      // it is genuinely absent (SSR / very old engines) this is a DELIBERATE
      // "no source of truth ⇒ no collection" trade-off — the intersecting set
      // stays empty and no pass measures anything — NOT merely an off-DOM
      // ReferenceError guard. The editor path is unaffected (fault-isolated).
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      // Fault-isolated like handleSettle/route-notify (RC3/P8): a throw during
      // Set mutation or scheduling must be caught + logged here, never escape
      // into IO's callback caller.
      try {
        for (const entry of entries) {
          // Guardrail: read isIntersecting + target ONLY. Never read
          // boundingClientRect/intersectionRect into pass data — all rects must
          // come from the gated enumerate.
          const target = entry.target;
          // Gate the add on live registry membership: a late IO record for an
          // element already unobserved/removed must not re-add a detached node
          // to the Set (null-safe downstream, but avoid unbounded retention).
          if (entry.isIntersecting && this.registry.has(target)) {
            this.visibleElements.add(target);
          } else {
            this.visibleElements.delete(target);
          }
        }
        this.schedule();
      } catch (error) {
        console.error(
          "[ComviInContextEditor] Collector IntersectionObserver callback failed (ignored).",
          error,
        );
      }
    });
  }

  private observe(element: Element): void {
    if (!this.observer) {
      return;
    }
    // Defensive: never observe the editor's own shadow-host UI (registered
    // elements never include it, but keep the cheap skip).
    if (element.hasAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE)) {
      return;
    }
    this.observer.observe(element);
  }

  private unobserve(element: Element): void {
    // Idempotent: safe on a rapid register→remove where observe never ran.
    this.visibleElements.delete(element);
    if (this.observer) {
      this.observer.unobserve(element);
    }
  }

  private handleRegistered = (element: Element): void => {
    this.observe(element);
  };

  private handleRemoved = (element: Element): void => {
    this.unobserve(element);
  };

  private schedule = (): void => {
    this.debounced();
  };
}
