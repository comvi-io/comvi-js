/**
 * Controllable IntersectionObserver test double.
 *
 * happy-dom ships an IntersectionObserver whose `observe()` never fires the
 * callback, so the collector's IO-driven visibility set would stay empty and
 * nothing would ever be collected. This mock replaces it with one that:
 *
 *   - by default (`autoIntersect = true`) synchronously reports every observed
 *     element as intersecting — the "everything is above the fold" assumption
 *     the pre-existing collector tests rely on; and
 *   - lets a test opt into precise control (`autoIntersect = false`) and then
 *     drive intersection changes via {@link setIntersecting} to exercise
 *     scroll-reveal, IO↔enumerate divergence, and short-lived cases.
 *
 * Entries expose `isIntersecting` + `target` ONLY — deliberately no rect — so a
 * test fails loudly if production code ever tries to read geometry off an IO
 * entry (the "no rect outside a gated pass" invariant).
 */

type IOCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

function makeEntry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  return { isIntersecting, target } as unknown as IntersectionObserverEntry;
}

export class MockIntersectionObserver {
  public static instances: MockIntersectionObserver[] = [];
  /** When true, `observe()` immediately reports the element as intersecting. */
  public static autoIntersect = true;

  public readonly observed = new Set<Element>();
  private readonly callback: IOCallback;

  constructor(callback: IOCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  public observe(element: Element): void {
    this.observed.add(element);
    if (MockIntersectionObserver.autoIntersect) {
      this.emit([makeEntry(element, true)]);
    }
  }

  public unobserve(element: Element): void {
    this.observed.delete(element);
  }

  public disconnect(): void {
    this.observed.clear();
  }

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Fire the callback for a set of entries (test-only). */
  public emit(entries: IntersectionObserverEntry[]): void {
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

/** Install the mock as the global IntersectionObserver. */
export function installIntersectionObserverMock(): void {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
}

/** Reset live instances and restore the auto-intersect default. */
export function resetIntersectionObserverMock(): void {
  MockIntersectionObserver.instances = [];
  MockIntersectionObserver.autoIntersect = true;
}

/**
 * Drive an intersection change for `element` across every observer watching it.
 * Use after `MockIntersectionObserver.autoIntersect = false` to model scrolling
 * an element into (or out of) the viewport.
 */
export function setIntersecting(element: Element, isIntersecting: boolean): void {
  for (const observer of MockIntersectionObserver.instances) {
    if (observer.observed.has(element)) {
      observer.emit([makeEntry(element, isIntersecting)]);
    }
  }
}
