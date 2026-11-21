/**
 * Semantic signals, constraint signals, and neighbor candidates.
 *
 * Neighbors and targets transmit key references plus structural, semantic and
 * geometry signals only — never rendered text. Two consequences:
 *   - every field that used to carry rendered text (aria-label content,
 *     container/heading title text, neighbor `rawText`) is now a presence
 *     boolean or omitted entirely; text is read locally only to DECIDE
 *     inclusion (the drop filter below), then discarded.
 *   - target-aware ranking (`rankNeighbors`, `NEIGHBOR_ROLE_WEIGHTS`,
 *     `assessConfidence`) is NOT ported here — that runs server-side against
 *     the full candidate set. The client only gathers and
 *     filters candidates.
 */

import type {
  AncestryNode,
  ConstraintSignals,
  ContainerType,
  ElementWithMeta,
  NeighborCandidate,
  RelativePosition,
  SemanticRole,
  SemanticSignals,
  WidthBucket,
} from "./types";
import { MAX_ANCESTRY_ENTRIES, MAX_NEIGHBORS_PER_OBSERVATION } from "./types";

const SEMANTIC_STOP_TAGS = new Set([
  "button",
  "a",
  "label",
  "input",
  "textarea",
  "select",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "th",
  "caption",
  "figcaption",
  "legend",
  "summary",
  "dt",
  "li",
]);

const CONTAINER_TAG_MAP: Record<string, ContainerType> = {
  dialog: "dialog",
  form: "form",
  fieldset: "fieldset",
  table: "table",
  thead: "table",
  tbody: "table",
  nav: "nav",
  section: "titled-section",
  article: "titled-section",
  aside: "generic",
  header: "generic",
  footer: "generic",
  main: "generic",
};

const INTERACTIVE_ARIA_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "option",
  "checkbox",
  "radio",
  "switch",
  "combobox",
]);

const MAX_ANCESTRY_DEPTH = 5;
export const MAX_NEIGHBOR_DISTANCE = 400; // px

function getContainerType(el: Element): ContainerType {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");

  if (role === "dialog" || role === "alertdialog") {
    return "dialog";
  }

  const mapped = CONTAINER_TAG_MAP[tag];
  if (!mapped) {
    return "generic";
  }

  if (mapped === "titled-section") {
    const hasHeading = el.querySelector("h1,h2,h3,h4,h5,h6");
    return hasHeading ? "titled-section" : "generic";
  }

  return mapped;
}

function hasResolvableAriaLabel(el: Element): boolean {
  if (el.getAttribute("aria-label")) {
    return true;
  }
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy && el.ownerDocument?.getElementById(labelledBy)) {
    return true;
  }
  return false;
}

function inferSemanticRole(
  tag: string,
  role: string | undefined,
  htmlType: string | undefined,
  hasCursorPointer: boolean,
): SemanticRole {
  if (role) {
    // Specific roles first — the generic interactive-role check would
    // otherwise shadow link/menuitem into "button".
    if (role === "link") return "link";
    if (role === "menuitem" || role === "menuitemcheckbox" || role === "menuitemradio")
      return "menu-item";
    if (role === "alert" || role === "status") return "alert";
    if (role === "tooltip") return "tooltip";
    if (role === "heading") return "heading";
    if (INTERACTIVE_ARIA_ROLES.has(role)) return "button";
  }
  switch (tag) {
    case "button":
      return "button";
    case "a":
      return "link";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "label":
      return "label";
    case "input":
      if (htmlType === "submit" || htmlType === "button") return "button";
      return "input";
    case "textarea":
    case "select":
      return "input";
    case "caption":
    case "figcaption":
    case "dt":
      return "caption";
    case "li":
      return "menu-item";
  }
  if (hasCursorPointer) return "button";
  return "body-text";
}

/**
 * Walks up to 5 ancestors from the
 * target, finding the first "semantic" element (button/heading/label/etc.)
 * then up to 3 useful containers above it.
 */
export function extractSemanticSignals(element: Element): SemanticSignals {
  let current: Element | null = element;
  let depth = 0;
  let foundPrimary = false;

  let semanticRole: SemanticRole = "unknown";
  let ariaRole: string | null = null;
  let hasAriaLabel = false;
  let htmlType: string | null = null;
  let hasPlaceholder = false;
  const ancestry: AncestryNode[] = [];

  while (current && depth < MAX_ANCESTRY_DEPTH) {
    const tag = current.tagName?.toLowerCase() ?? "";
    const role = current.getAttribute("role");
    const type = (current as HTMLInputElement).type || undefined;
    const placeholder = (current as HTMLInputElement).placeholder || undefined;
    const hasCursorPointer = getComputedStyle(current).cursor === "pointer";
    const isSemanticStop = SEMANTIC_STOP_TAGS.has(tag);
    const isInteractiveRole = role ? INTERACTIVE_ARIA_ROLES.has(role) : false;
    const isContainer = tag in CONTAINER_TAG_MAP;

    if (!foundPrimary && (isSemanticStop || isInteractiveRole || hasCursorPointer)) {
      semanticRole = inferSemanticRole(tag, role ?? undefined, type, hasCursorPointer);
      ariaRole = role;
      hasAriaLabel = hasResolvableAriaLabel(current);
      htmlType = type && type !== "text" ? type : null;
      hasPlaceholder = Boolean(placeholder);
      foundPrimary = true;
      ancestry.push({ tag, role, containerType: "generic", hasTitle: false });
    } else if (foundPrimary && isContainer && ancestry.length < MAX_ANCESTRY_ENTRIES) {
      const containerType = getContainerType(current);
      const headingEl = current.querySelector("h1,h2,h3,h4,h5,h6");
      const hasTitle = Boolean(
        current.getAttribute("aria-label") || headingEl?.textContent?.trim(),
      );

      if (containerType !== "generic" || hasTitle) {
        ancestry.push({ tag, role, containerType, hasTitle });
      }
    }

    current = current.parentElement;
    depth++;
  }

  return { semanticRole, ariaRole, hasAriaLabel, htmlType, hasPlaceholder, ancestry };
}

/** Buckets only, never rendered text. */
export function extractConstraintSignals(element: Element, rect: DOMRect): ConstraintSignals {
  const style = getComputedStyle(element);
  const fontSize = parseFloat(style.fontSize) || 14;
  const w = rect.width;

  const isTruncatedHard =
    (style.overflow === "hidden" || style.textOverflow === "ellipsis") &&
    style.whiteSpace === "nowrap";

  const likelyTruncated = style.overflow === "hidden" && style.whiteSpace !== "nowrap";

  const singleLine =
    style.whiteSpace === "nowrap" ||
    (element.tagName.toLowerCase() === "input" &&
      (element as HTMLInputElement).type !== "textarea");

  let widthBucket: WidthBucket;
  if (w < 80) widthBucket = "tiny";
  else if (w < 160) widthBucket = "small";
  else if (w < 320) widthBucket = "medium";
  else if (w < 640) widthBucket = "large";
  else widthBucket = "full";

  const mustBeShort = isTruncatedHard || widthBucket === "tiny";
  const visuallyCompact = widthBucket === "small" || widthBucket === "medium";

  let visualProminence: "high" | "medium" | "low";
  if (fontSize >= 20) visualProminence = "high";
  else if (fontSize >= 14) visualProminence = "medium";
  else visualProminence = "low";

  return {
    hard: { mustBeShort, singleLine, widthBucket },
    soft: { likelyTruncated, visuallyCompact, visualProminence },
  };
}

function getNearestContainerType(el: Element): ContainerType {
  let cur: Element | null = el.parentElement;
  for (let i = 0; i < MAX_ANCESTRY_DEPTH && cur; i++) {
    const tag = cur.tagName.toLowerCase();
    if (tag in CONTAINER_TAG_MAP) return getContainerType(cur);
    cur = cur.parentElement;
  }
  return "generic";
}

function findSharedContainer(a: Element, b: Element): ContainerType | null {
  let cur: Element | null = a.parentElement;
  for (let i = 0; i < MAX_ANCESTRY_DEPTH && cur; i++) {
    const tag = cur.tagName.toLowerCase();
    if (tag in CONTAINER_TAG_MAP && cur.contains(b)) {
      return getContainerType(cur);
    }
    cur = cur.parentElement;
  }
  return null;
}

const GENERIC_NOISE = /^(ok|yes|no|more|back|next|item|value|text|\d+)$/i;
const PII_PATTERN = /[@\d]{5,}|^\+?\d[\d\s-]{7,}/;
const MOSTLY_NUMERIC = /^\d[\d\s.,%-]*$/;
const MAX_NEIGHBOR_TEXT_LENGTH = 80;

/**
 * Client-side drop filter — the server never sees text, so this reads the
 * neighbor's local
 * text ONLY to decide inclusion, then the caller discards it. Dedupe by
 * (namespace,key) is handled by the caller.
 */
function shouldIncludeNeighbor(rawText: string | undefined, semanticRole: SemanticRole): boolean {
  if (!rawText) {
    return true;
  }
  if (rawText.length > MAX_NEIGHBOR_TEXT_LENGTH) return false;
  if (PII_PATTERN.test(rawText)) return false;
  if (MOSTLY_NUMERIC.test(rawText)) return false;
  if (GENERIC_NOISE.test(rawText) && semanticRole !== "heading" && semanticRole !== "label")
    return false;
  return true;
}

/**
 * `all` must already carry
 * precomputed semantic signals (computed once per element, not per
 * target/neighbor pair, to avoid an O(n^2) `getComputedStyle` blowup).
 */
export function buildNeighborCandidates(
  target: ElementWithMeta,
  all: Array<ElementWithMeta & { semantic: SemanticSignals }>,
): NeighborCandidate[] {
  const tx = target.centerPoint.x;
  const ty = target.centerPoint.y;
  const seen = new Set<string>();

  const candidates = all
    .filter((el) => !(el.namespace === target.namespace && el.key === target.key))
    .flatMap((el): NeighborCandidate[] => {
      const dx = el.centerPoint.x - tx;
      const dy = el.centerPoint.y - ty;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
      if (distance > MAX_NEIGHBOR_DISTANCE) {
        return [];
      }

      const compositeKey = el.namespace + "::" + el.key;
      if (seen.has(compositeKey)) {
        return [];
      }

      const rawText = el.element.textContent?.trim().slice(0, MAX_NEIGHBOR_TEXT_LENGTH + 1);
      if (!shouldIncludeNeighbor(rawText, el.semantic.semanticRole)) {
        return [];
      }

      seen.add(compositeKey);

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let relativePosition: RelativePosition;
      if (absDy < 30 && absDx > absDy) {
        relativePosition = dx > 0 ? "right" : "left";
      } else {
        relativePosition = dy > 0 ? "below" : "above";
      }

      const sameContainerAs = findSharedContainer(target.element, el.element);
      const containerType = getNearestContainerType(el.element);

      return [
        {
          namespace: el.namespace,
          key: el.key,
          semanticRole: el.semantic.semanticRole,
          relativePosition,
          containerType,
          sameContainerAs,
          distance,
          readingOrderIndex: el.readingOrderIndex,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);

  return candidates.slice(0, MAX_NEIGHBORS_PER_OBSERVATION);
}
