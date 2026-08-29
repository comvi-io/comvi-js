/**
 * Walks the existing TranslationRegistry to build the set
 * of visible translation targets for this pass.
 *
 * The registry stores no geometry — no layout thrash happens outside a
 * pass; rects are measured here, and callers must only invoke this AFTER
 * the change-gate has already decided a pass is worth attempting.
 */

import type { TranslationRegistry } from "../TranslationRegistry";
import type { ElementData } from "../types/translation";
import type { ElementWithMeta, KeyRef } from "./types";

function isViewportIntersecting(rect: DOMRect): boolean {
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }

  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth || document.documentElement.clientWidth : 0;
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight || document.documentElement.clientHeight : 0;

  return (
    rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
  );
}

/**
 * Elements the collector must never read: input values are never read,
 * and password/contenteditable fields are skipped entirely — even as
 * potential targets — since their rendered content is untrusted by design.
 */
function isSensitiveElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input") {
    const type = (element as HTMLInputElement).type;
    if (type === "password") {
      return true;
    }
  }
  return (element as HTMLElement).isContentEditable === true;
}

/**
 * Visible-only translation targets, ordered top-to-bottom then left-to-right
 * and tagged with a deterministic `readingOrderIndex`.
 *
 * When `visibleElements` is provided (the IntersectionObserver-intersecting
 * set owned by `CollectorTriggers`), measurement is restricted to that subset
 * instead of the whole registry — so `getBoundingClientRect` scales with the
 * on-screen count, not total registry size. `isViewportIntersecting` still
 * runs as the send authority: an element IO reports intersecting but that this
 * check filters out (e.g. clipped by a scrolled-out overflow container) is
 * dropped, never sent. Elements removed from the registry between the async IO
 * callback and this settle are skipped (null-safe), never dereferenced.
 */
export function enumerateVisibleTargets(
  registry: TranslationRegistry,
  visibleElements?: ReadonlySet<Element>,
): ElementWithMeta[] {
  const raw: Array<{ element: Element; namespace: string; key: string; rect: DOMRect }> = [];

  const consider = (element: Element, data: ElementData): void => {
    if (isSensitiveElement(element)) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (!isViewportIntersecting(rect)) {
      return;
    }

    for (const nodeData of data.nodes.values()) {
      raw.push({ element, namespace: nodeData.ns, key: nodeData.key, rect });
    }
  };

  if (visibleElements) {
    for (const element of visibleElements) {
      const data = registry.get(element);
      if (!data) {
        continue;
      }
      consider(element, data);
    }
  } else {
    for (const [element, data] of registry.entries()) {
      consider(element, data);
    }
  }

  const sorted = raw.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  return sorted.map((entry, index) => ({
    element: entry.element,
    namespace: entry.namespace,
    key: entry.key,
    rect: entry.rect,
    centerPoint: {
      x: entry.rect.left + entry.rect.width / 2,
      y: entry.rect.top + entry.rect.height / 2,
    },
    readingOrderIndex: index,
  }));
}

/**
 * Every distinct {namespace,key} currently known to the registry, regardless
 * of visibility — used for the session-start handshake, which wants the
 * broadest possible hit rate against the server's stored profiles.
 */
export function collectAllKeyRefs(registry: TranslationRegistry): KeyRef[] {
  const seen = new Set<string>();
  const refs: KeyRef[] = [];

  for (const [, data] of registry.entries()) {
    for (const nodeData of data.nodes.values()) {
      const compositeKey = nodeData.ns + "::" + nodeData.key;
      if (seen.has(compositeKey)) {
        continue;
      }
      seen.add(compositeKey);
      refs.push({ namespace: nodeData.ns, key: nodeData.key });
    }
  }

  return refs;
}

/**
 * The distinct {namespace,key} refs for a specific set of elements (the
 * IntersectionObserver-intersecting set), used to compute the visibility-aware
 * pre-gate signature WITHOUT touching any rect.
 *
 * Null-safety is load-bearing: an element can be removed from the registry
 * between the async IO callback that added it to the set and this settle, so
 * `registry.get(el)` may be `undefined` — those entries are skipped, never
 * dereferenced. A throw here would hit the pass catch and silently disable
 * collection for the whole session.
 */
export function collectKeyRefsForElements(
  registry: TranslationRegistry,
  elements: ReadonlySet<Element>,
): KeyRef[] {
  const seen = new Set<string>();
  const refs: KeyRef[] = [];

  for (const element of elements) {
    const data = registry.get(element);
    if (!data) {
      continue;
    }
    for (const nodeData of data.nodes.values()) {
      const compositeKey = nodeData.ns + "::" + nodeData.key;
      if (seen.has(compositeKey)) {
        continue;
      }
      seen.add(compositeKey);
      refs.push({ namespace: nodeData.ns, key: nodeData.key });
    }
  }

  return refs;
}
