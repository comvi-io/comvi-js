/**
 * screenGroup (2d, Axis C1): client-side normalized route + open-modal
 * discriminator. Dynamic segments (numeric/uuid/long-hex/opaque/email-like)
 * become `:param` so the same logical screen collapses across instances.
 */

import type { TranslationRegistry } from "../TranslationRegistry";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_PATTERN = /^[0-9a-f]{16,}$/i;
const NUMERIC_PATTERN = /^\d+$/;
const OPAQUE_SEGMENT_LENGTH = 20;

function isDynamicSegment(segment: string): boolean {
  if (segment.length === 0) {
    return false;
  }
  if (NUMERIC_PATTERN.test(segment)) return true;
  if (UUID_PATTERN.test(segment)) return true;
  if (LONG_HEX_PATTERN.test(segment)) return true;
  if (segment.length > OPAQUE_SEGMENT_LENGTH) return true;
  // PII guard: a human-readable slug like a username or email (e.g.
  // `user@x.co`) isn't covered by the length/hex/numeric checks above — '@'
  // is the clear, boring signal for that PII class, so mask on it directly.
  if (segment.includes("@")) return true;
  return false;
}

export function normalizeRoute(pathname: string): string {
  const segments = pathname.split("/");
  const normalized = segments.map((segment) => (isDynamicSegment(segment) ? ":param" : segment));
  const joined = normalized.join("/");
  return joined.length > 0 ? joined : "/";
}

function isVisibleDialogElement(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Finds the topmost open modal/dialog and derives a stable identifier for
 * it — never rendered text (RC4). Prefers a DOM id/data-testid/labelledby
 * ref, falling back to the {namespace,key} ref of the first registered
 * translation found inside it.
 */
export function findModalDiscriminator(
  root: ParentNode,
  registry: TranslationRegistry,
): string | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"]',
    ),
  ).filter(isVisibleDialogElement);

  if (candidates.length === 0) {
    return null;
  }

  // Topmost = last matching element in document order — a deterministic,
  // dependency-free proxy (portaled/nested dialogs render later in the DOM).
  const topmost = candidates[candidates.length - 1]!;

  const stableAttr =
    topmost.id || topmost.getAttribute("data-testid") || topmost.getAttribute("aria-labelledby");
  if (stableAttr) {
    return `modal:${stableAttr}`;
  }

  for (const [element, data] of registry.entries()) {
    if (topmost.contains(element)) {
      const first = data.nodes.values().next().value;
      if (first) {
        return `modal:${first.ns}:${first.key}`;
      }
    }
  }

  return "modal:unknown";
}

export interface ScreenGroupResult {
  screenGroup: string;
}

export function computeScreenGroup(
  root: ParentNode,
  registry: TranslationRegistry,
  pathname: string,
): ScreenGroupResult {
  const normalized = normalizeRoute(pathname);
  const modalId = findModalDiscriminator(root, registry);
  const screenGroup = modalId ? `${normalized}#${modalId}` : normalized;
  return { screenGroup };
}
