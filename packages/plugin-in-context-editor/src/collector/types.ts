/**
 * Shared types for the passive context collector (RALPLAN wave-2a, Item 2).
 *
 * Wire contract is structured `{namespace, key}` everywhere (RC-B) — never a
 * flat `"ns:key"` string, never a client-supplied numeric keyId (M1/M4).
 * Neighbor/target signals carry key refs + structural/semantic/geometry data
 * only — rendered text never leaves the page (RC4): any v3 field that used
 * to carry text content is represented here as a presence boolean instead.
 */

export interface KeyRef {
  namespace: string;
  key: string;
}

export type SemanticRole =
  | "button"
  | "heading"
  | "label"
  | "link"
  | "input"
  | "menu-item"
  | "alert"
  | "tooltip"
  | "caption"
  | "body-text"
  | "unknown";

export type RelativePosition = "above" | "below" | "left" | "right" | "same-container";

export type WidthBucket = "tiny" | "small" | "medium" | "large" | "full";

export type UiType =
  | "primary-button"
  | "secondary-button"
  | "destructive-button"
  | "page-title"
  | "section-title"
  | "form-label"
  | "form-placeholder"
  | "error-message"
  | "nav-item"
  | "status-badge"
  | "body-text"
  | "unknown";

export type TranslationRole =
  | "imperative-verb"
  | "noun-phrase"
  | "short-status"
  | "field-label"
  | "placeholder-hint"
  | "error-sentence"
  | "nav-label"
  | "descriptive-text"
  | "unknown";

export type ContainerType =
  | "dialog"
  | "form"
  | "fieldset"
  | "table"
  | "titled-section"
  | "nav"
  | "generic";

/**
 * No rendered text (RC4) — a container's title is presence-only.
 *
 * `role` is required-but-nullable on the wire (server `AncestorInfoSchema`:
 * `Type.Union([Type.String(...), Type.Null()])`, not `Type.Optional`) — use
 * `null`, never omit the key, when there is no ARIA role.
 */
export interface AncestryNode {
  tag: string;
  role: string | null;
  containerType: ContainerType;
  hasTitle: boolean;
}

/**
 * `ariaRole`/`htmlType` are required-but-nullable on the wire (server
 * `SemanticSignalsSchema`) — use `null`, never omit the key, when absent.
 */
export interface SemanticSignals {
  semanticRole: SemanticRole;
  ariaRole: string | null;
  hasAriaLabel: boolean;
  htmlType: string | null;
  hasPlaceholder: boolean;
  ancestry: AncestryNode[];
}

export interface ConstraintSignals {
  hard: {
    mustBeShort: boolean;
    singleLine: boolean;
    widthBucket: WidthBucket;
  };
  soft: {
    likelyTruncated: boolean;
    visuallyCompact: boolean;
    visualProminence: "high" | "medium" | "low";
  };
}

/**
 * Neighbor reference — {namespace,key} + structural/geometry signals only,
 * never rendered text (RC4). This is exactly the wire shape (server
 * `NeighborRefSchema`, `additionalProperties: false`) — `ariaRole`,
 * `hasAriaLabel`, and `textLength` are deliberately NOT here: they were
 * client-only extras nothing consumes, and the server rejects unrecognized
 * fields outright.
 */
export interface NeighborCandidate {
  namespace: string;
  key: string;
  semanticRole: SemanticRole;
  relativePosition: RelativePosition;
  containerType: ContainerType;
  sameContainerAs: ContainerType | null;
  distance: number;
  readingOrderIndex: number;
}

export interface ElementWithMeta {
  element: Element;
  namespace: string;
  key: string;
  rect: DOMRect;
  centerPoint: { x: number; y: number };
  readingOrderIndex: number;
}

export interface ElementWithSignals extends ElementWithMeta {
  semantic: SemanticSignals;
  constraints: ConstraintSignals;
}

/**
 * Full observation body (`items[]` on POST /v1/context/usages). Never
 * carries observationHash (RC-A). This is exactly the server's
 * `ObservationSchema` (`additionalProperties: false` — any extra field is a
 * 400, not silently ignored):
 *   - `uiType`/`translationRole` ARE wire fields (not client-local-only):
 *     the server recomputes `observationHash` from these payload-carried
 *     values rather than re-inferring them itself, so drift between this
 *     client's `targetType.ts` mirror and the server's authoritative
 *     `inferTargetType` can never cause a silent hash mismatch — both sides
 *     hash the exact same uiType/translationRole for a given observation.
 *   - there is deliberately NO top-level `readingOrderIndex` or `debug`
 *     field — those are client-only bookkeeping (kept on `PassItem` in
 *     `transport.ts`, never serialized) that the server's schema doesn't
 *     define and would reject.
 *   - there is deliberately NO `spatial` field — the client never measures
 *     or transmits raw rect/centerPoint geometry (RC4); the server's schema
 *     currently still requires `spatial`, which worker-platform is making
 *     optional to match this contract.
 */
export interface Observation {
  namespace: string;
  key: string;
  screenGroup: string;
  uiType: UiType;
  translationRole: TranslationRole;
  semantic: SemanticSignals;
  constraints: ConstraintSignals;
  neighbors: NeighborCandidate[];
}

export interface StillValidPing {
  namespace: string;
  key: string;
  screenGroup: string;
  observationHash: string;
}

export interface HandshakeRequest {
  keys: KeyRef[];
}

export interface HandshakeScreenGroupEntry {
  screenGroup: string;
  observationHash: string;
}

export interface HandshakeResponseEntry {
  namespace: string;
  key: string;
  profileHash: string;
  confidenceLevel: "high" | "medium" | "low";
  lastSeenAt: string;
  screenGroups: HandshakeScreenGroupEntry[];
}

export interface HandshakeResponse {
  entries: HandshakeResponseEntry[];
}

export interface UsagesRequest {
  origin: string;
  hashFnVersion: number;
  items: Observation[];
  stillValid: StillValidPing[];
}

export interface UsagesResponseUpdatedEntry {
  namespace: string;
  key: string;
  screenGroup: string;
  observationHash: string;
  profileHash: string;
}

export interface UsagesResponseResendEntry {
  namespace: string;
  key: string;
  screenGroup: string;
}

export interface UsagesResponse {
  updated: UsagesResponseUpdatedEntry[];
  resend: UsagesResponseResendEntry[];
  orphanObservations: number;
  hashSkew: number;
}

/** Body-limit caps (§1b) — the client stays under these defensively; the server enforces them authoritatively. */
export const MAX_ITEMS_PER_BATCH = 100;
export const MAX_NEIGHBORS_PER_OBSERVATION = 12;
export const MAX_ANCESTRY_ENTRIES = 3;
