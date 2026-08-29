/**
 * screenGroup: a stable screen discriminator, PII-safe by
 * construction. The integration can supply a readable route template via
 * `screenGroupResolver` (e.g. "/users/:id"); without one the group is an
 * opaque digest of the client-side normalized route, so raw path segments
 * (short usernames, order codes, percent-encoded emails — anything the
 * heuristics can't reliably detect) never reach the wire. Residual dynamic
 * segments the normalization misses only inflate group cardinality; they are
 * not recoverable from the digest.
 */

import type { TranslationRegistry } from "../TranslationRegistry";
import { sha256Hex } from "./hash/observation-hash";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_PATTERN = /^[0-9a-f]{16,}$/i;
const NUMERIC_PATTERN = /^\d+$/;
const OPAQUE_SEGMENT_LENGTH = 20;

const ROUTE_DIGEST_LENGTH = 16;
const MODAL_DIGEST_LENGTH = 12;
const MAX_RESOLVED_GROUP_LENGTH = 120;

/**
 * A host-supplied screen grouping hook: return a stable, PII-free route
 * template for the current URL (e.g. "/users/:id"), or null/undefined to
 * fall back to the opaque route digest.
 */
export type ScreenGroupResolver = () => string | null | undefined;

function isDynamicSegment(segment: string): boolean {
  if (segment.length === 0) {
    return false;
  }
  if (NUMERIC_PATTERN.test(segment)) return true;
  if (UUID_PATTERN.test(segment)) return true;
  if (LONG_HEX_PATTERN.test(segment)) return true;
  if (segment.length > OPAQUE_SEGMENT_LENGTH) return true;
  if (segment.includes("@")) return true;
  return false;
}

/**
 * Best-effort route normalization. Since the default screenGroup is a digest
 * of this value, normalization exists for digest STABILITY (the same logical
 * screen collapses across entity ids), not as the PII barrier — the digest is.
 */
export function normalizeRoute(pathname: string): string {
  const segments = pathname.split("/");
  const normalized = segments.map((segment) => (isDynamicSegment(segment) ? ":param" : segment));
  const joined = normalized.join("/");
  return joined.length > 0 ? joined : "/";
}

/** Opaque, deterministic default group for a raw route. */
export function routeDigest(route: string): string {
  return "route:" + sha256Hex(normalizeRoute(route)).slice(0, ROUTE_DIGEST_LENGTH);
}

/**
 * The raw route input for grouping: pathname plus the hash-router path
 * ("#/users/1" style) when present, so hash-routed SPAs don't collapse every
 * screen into "/".
 */
export function readCurrentRoute(): string {
  if (typeof location === "undefined") {
    return "";
  }
  const hash = location.hash;
  return location.pathname + (hash.startsWith("#/") ? hash.slice(1) : "");
}

function isVisibleDialogElement(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export interface ModalContext {
  /** The topmost open dialog element — targets inside it get the modal-suffixed group. */
  element: Element;
  discriminator: string;
}

/**
 * Finds the topmost open modal/dialog and derives a stable identifier for
 * it — never rendered text. A DOM id/data-testid/labelledby ref is
 * digested rather than sent verbatim (dynamic ids can embed user data);
 * the fallback is the {namespace,key} ref of the first registered
 * translation found inside it, which is safe on the wire as-is.
 */
export function findModalContext(
  root: ParentNode,
  registry: TranslationRegistry,
): ModalContext | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]',
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
    return {
      element: topmost,
      discriminator: "modal:" + sha256Hex(stableAttr).slice(0, MODAL_DIGEST_LENGTH),
    };
  }

  for (const [element, data] of registry.entries()) {
    if (topmost.contains(element)) {
      const first = data.nodes.values().next().value;
      if (first) {
        return { element: topmost, discriminator: `modal:${first.ns}:${first.key}` };
      }
    }
  }

  return { element: topmost, discriminator: "modal:unknown" };
}

export interface ScreenGroupResult {
  /** Group for targets OUTSIDE any open modal. */
  screenGroup: string;
  /** Open modal context, or null. The caller suffixes `#<discriminator>` for targets inside it. */
  modal: ModalContext | null;
}

export function computeScreenGroup(
  root: ParentNode,
  registry: TranslationRegistry,
  route: string,
  resolver?: ScreenGroupResolver,
): ScreenGroupResult {
  let resolved: string | null = null;
  if (resolver) {
    try {
      const value = resolver();
      if (typeof value === "string" && value.trim().length > 0) {
        resolved = value.trim().slice(0, MAX_RESOLVED_GROUP_LENGTH);
      }
    } catch {
      // Fault-isolated: a throwing host resolver falls back to the digest.
    }
  }

  const screenGroup = resolved ?? routeDigest(route);
  const modal = findModalContext(root, registry);
  return { screenGroup, modal };
}
