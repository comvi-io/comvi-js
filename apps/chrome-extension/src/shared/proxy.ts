/**
 * Validation for proxied API requests.
 *
 * The service worker is the only component holding API keys. Every request
 * arriving over the API_PROXY_REQUEST channel originates in the page's MAIN
 * world and is therefore fully attacker-controlled on a hostile page. This
 * module confines what such a request can do to an explicit contract: the
 * exact routes the editor runtime uses, matched by method AND path pattern,
 * with per-route query and body validation, bounded sizes (UTF-8 bytes), a
 * session-bound project id for export routes, and telemetry routes gated on
 * the user's explicit opt-in.
 *
 * Anything not in the table — including every future API route — is rejected
 * locally without a network request.
 */

import type { ApiProxyRequestPayload } from "./messages";

/** Session facts the proxy contract is evaluated against. */
export interface ProxySessionContext {
  /** Canonical page origin the session is bound to. */
  origin: string;
  /** Project id captured during key validation; required for export routes. */
  projectId?: string | number;
  /** Whether the user explicitly enabled context telemetry for this session. */
  collectContext: boolean;
}

export type ProxyValidationResult =
  | { ok: true; url: string; method: string; body?: string; keepalive: boolean; id: string }
  | { ok: false; error: string };

const MAX_PATH_LENGTH = 2048;
const MAX_BODY_BYTES = 1_000_000;
const MAX_JSON_DEPTH = 8;
const MAX_TRANSLATIONS = 100;
const MAX_KEY_LENGTH = 768;
const MAX_NAMESPACE_LENGTH = 255;
const MAX_TRANSLATION_VALUE_LENGTH = 65_536;
const MAX_LOCALE_LENGTH = 50;
const CONTEXT_BATCH_CAP = 100;
const CONTEXT_NEIGHBOR_CAP = 12;
const CONTEXT_ANCESTRY_CAP = 3;
const CONTEXT_SCREEN_GROUP_MAX = 512;
const CONTEXT_HASH_MAX = 64;

/** Locale / namespace identifiers (mirrors fetch-loader's VALID_ID). */
const VALID_ID = /^[\w\-@.]+$/;

/** No control characters anywhere in identifier-ish values. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// --- small validators -------------------------------------------------------

function isBoundedString(value: unknown, max: number, min = 1): value is string {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    !CONTROL_CHARS.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isStringWithMax(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && !CONTROL_CHARS.test(value);
}

function isFiniteNumber(value: unknown, minimum?: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (minimum === undefined || value >= minimum)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function withinDepth(value: unknown, maxDepth: number): boolean {
  if (maxDepth < 0) return false;
  if (Array.isArray(value)) {
    return value.every((item) => withinDepth(item, maxDepth - 1));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every((item) => withinDepth(item, maxDepth - 1));
  }
  return true;
}

function isIdList(value: string, maxItems: number, maxItemLength: number): boolean {
  const items = value.split(",");
  if (items.length === 0 || items.length > maxItems) return false;
  return items.every(
    (item) => item.length > 0 && item.length <= maxItemLength && VALID_ID.test(item),
  );
}

// --- query specs -------------------------------------------------------------

type QueryValidator = (value: string) => boolean;

const EXPORT_QUERY: Record<string, QueryValidator> = {
  locales: (v) => isIdList(v, 20, 64),
  namespaces: (v) => isIdList(v, 50, 128),
};

// --- body validators ---------------------------------------------------------

type BodyValidator = (body: unknown, ctx: ProxySessionContext) => string | null;

/** PUT /v1/keys — translationService.saveTranslation payload. */
const validateSaveKeyBody: BodyValidator = (body) => {
  if (!isPlainObject(body)) return "Body must be an object";
  if (!hasExactKeys(body, ["key", "namespace", "isPlural", "translations"])) {
    return "Invalid save payload fields";
  }

  if (!isBoundedString(body.key, MAX_KEY_LENGTH)) return "Invalid key";
  if (!isBoundedString(body.namespace, MAX_NAMESPACE_LENGTH)) return "Invalid namespace";
  if (typeof body.isPlural !== "boolean") return "Invalid isPlural";
  if (!isPlainObject(body.translations)) return "Invalid translations";

  const entries = Object.entries(body.translations);
  if (entries.length > MAX_TRANSLATIONS) return "Too many translations";
  for (const [lang, entry] of entries) {
    if (!isBoundedString(lang, MAX_LOCALE_LENGTH)) return "Invalid language code";
    if (!isPlainObject(entry) || !hasExactKeys(entry, ["value", "status"])) {
      return "Invalid translation entry";
    }
    if (typeof entry.value !== "string" || entry.value.length > MAX_TRANSLATION_VALUE_LENGTH) {
      return "Invalid translation value";
    }
    if (!isOneOf(entry.status, ["translated", "not_reviewed", "not_translated"])) {
      return "Invalid translation status";
    }
  }
  return null;
};

/** POST /v1/context/handshake — CollectorTransport.handshake payload. */
const validateHandshakeBody: BodyValidator = (body) => {
  if (!isPlainObject(body)) return "Body must be an object";
  for (const prop of Object.keys(body)) {
    if (prop !== "keys") return `Unexpected body field: ${prop}`;
  }
  if (!Array.isArray(body.keys) || body.keys.length > 100) return "Invalid keys";
  for (const ref of body.keys) {
    if (!isPlainObject(ref) || !hasExactKeys(ref, ["namespace", "key"])) {
      return "Invalid key ref";
    }
    if (
      !isBoundedString(ref.namespace, MAX_NAMESPACE_LENGTH) ||
      !isBoundedString(ref.key, MAX_KEY_LENGTH)
    ) {
      return "Invalid key ref";
    }
  }
  return null;
};

const SEMANTIC_ROLES = [
  "button",
  "heading",
  "label",
  "link",
  "input",
  "menu-item",
  "alert",
  "tooltip",
  "caption",
  "body-text",
  "unknown",
] as const;
const CONTAINER_TYPES = [
  "dialog",
  "form",
  "fieldset",
  "table",
  "titled-section",
  "nav",
  "generic",
] as const;
const WIDTH_BUCKETS = ["tiny", "small", "medium", "large", "full"] as const;
const RELATIVE_POSITIONS = ["above", "below", "left", "right", "same-container"] as const;
const UI_TYPES = [
  "primary-button",
  "secondary-button",
  "destructive-button",
  "page-title",
  "section-title",
  "form-label",
  "form-placeholder",
  "error-message",
  "nav-item",
  "status-badge",
  "body-text",
  "unknown",
] as const;
const TRANSLATION_ROLES = [
  "imperative-verb",
  "noun-phrase",
  "short-status",
  "field-label",
  "placeholder-hint",
  "error-sentence",
  "nav-label",
  "descriptive-text",
  "unknown",
] as const;

function isSemanticSignals(value: unknown): boolean {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "semanticRole",
      "ariaRole",
      "htmlType",
      "hasAriaLabel",
      "hasPlaceholder",
      "ancestry",
    ]) ||
    !isOneOf(value.semanticRole, SEMANTIC_ROLES) ||
    !(value.ariaRole === null || isStringWithMax(value.ariaRole, 64)) ||
    !(value.htmlType === null || isStringWithMax(value.htmlType, 64)) ||
    typeof value.hasAriaLabel !== "boolean" ||
    typeof value.hasPlaceholder !== "boolean" ||
    !Array.isArray(value.ancestry) ||
    value.ancestry.length > CONTEXT_ANCESTRY_CAP
  ) {
    return false;
  }
  return value.ancestry.every(
    (ancestor) =>
      isPlainObject(ancestor) &&
      hasExactKeys(ancestor, ["tag", "role", "containerType", "hasTitle"]) &&
      isStringWithMax(ancestor.tag, 32) &&
      (ancestor.role === null || isStringWithMax(ancestor.role, 64)) &&
      isOneOf(ancestor.containerType, CONTAINER_TYPES) &&
      typeof ancestor.hasTitle === "boolean",
  );
}

function isSpatialSignals(value: unknown): boolean {
  if (!isPlainObject(value) || !hasExactKeys(value, ["rect", "centerPoint", "readingOrderIndex"])) {
    return false;
  }
  const { rect, centerPoint } = value;
  return (
    isPlainObject(rect) &&
    hasExactKeys(rect, ["x", "y", "w", "h"]) &&
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.w) &&
    isFiniteNumber(rect.h) &&
    isPlainObject(centerPoint) &&
    hasExactKeys(centerPoint, ["x", "y"]) &&
    isFiniteNumber(centerPoint.x) &&
    isFiniteNumber(centerPoint.y) &&
    isNonNegativeInteger(value.readingOrderIndex)
  );
}

function isConstraintSignals(value: unknown): boolean {
  if (!isPlainObject(value) || !hasExactKeys(value, ["hard", "soft"])) return false;
  const { hard, soft } = value;
  return (
    isPlainObject(hard) &&
    hasExactKeys(hard, ["mustBeShort", "singleLine", "widthBucket"]) &&
    typeof hard.mustBeShort === "boolean" &&
    typeof hard.singleLine === "boolean" &&
    isOneOf(hard.widthBucket, WIDTH_BUCKETS) &&
    isPlainObject(soft) &&
    hasExactKeys(soft, ["likelyTruncated", "visuallyCompact", "visualProminence"]) &&
    typeof soft.likelyTruncated === "boolean" &&
    typeof soft.visuallyCompact === "boolean" &&
    isOneOf(soft.visualProminence, ["high", "medium", "low"])
  );
}

function isNeighbor(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, [
      "namespace",
      "key",
      "semanticRole",
      "relativePosition",
      "containerType",
      "sameContainerAs",
      "distance",
      "readingOrderIndex",
    ]) &&
    isBoundedString(value.namespace, MAX_NAMESPACE_LENGTH) &&
    isBoundedString(value.key, MAX_KEY_LENGTH) &&
    isOneOf(value.semanticRole, SEMANTIC_ROLES) &&
    isOneOf(value.relativePosition, RELATIVE_POSITIONS) &&
    isOneOf(value.containerType, CONTAINER_TYPES) &&
    (value.sameContainerAs === null || isOneOf(value.sameContainerAs, CONTAINER_TYPES)) &&
    isFiniteNumber(value.distance, 0) &&
    isNonNegativeInteger(value.readingOrderIndex)
  );
}

function isObservation(value: unknown): boolean {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(
      value,
      [
        "namespace",
        "key",
        "screenGroup",
        "uiType",
        "translationRole",
        "semantic",
        "constraints",
        "neighbors",
      ],
      ["spatial"],
    ) ||
    !isBoundedString(value.namespace, MAX_NAMESPACE_LENGTH) ||
    !isBoundedString(value.key, MAX_KEY_LENGTH) ||
    !isBoundedString(value.screenGroup, CONTEXT_SCREEN_GROUP_MAX) ||
    !isOneOf(value.uiType, UI_TYPES) ||
    !isOneOf(value.translationRole, TRANSLATION_ROLES) ||
    !isSemanticSignals(value.semantic) ||
    !isConstraintSignals(value.constraints) ||
    !Array.isArray(value.neighbors) ||
    value.neighbors.length > CONTEXT_NEIGHBOR_CAP ||
    !value.neighbors.every(isNeighbor)
  ) {
    return false;
  }
  return !Object.prototype.hasOwnProperty.call(value, "spatial") || isSpatialSignals(value.spatial);
}

/** POST /v1/context/usages — CollectorTransport.sendBatch / flushOnTeardown payload. */
const validateUsagesBody: BodyValidator = (body, ctx) => {
  if (!isPlainObject(body)) return "Body must be an object";

  const allowed = new Set(["origin", "hashFnVersion", "items", "stillValid"]);
  for (const prop of Object.keys(body)) {
    if (!allowed.has(prop)) return `Unexpected body field: ${prop}`;
  }

  // Telemetry must be attributed to the page the session was opened for —
  // a page cannot report usage on behalf of another origin.
  if (body.origin !== ctx.origin) return "Telemetry origin mismatch";

  if (!isNonNegativeInteger(body.hashFnVersion)) return "Invalid hashFnVersion";

  if (
    !Array.isArray(body.items) ||
    body.items.length > CONTEXT_BATCH_CAP ||
    !body.items.every(isObservation)
  ) {
    return "Invalid items";
  }

  if (!Array.isArray(body.stillValid) || body.stillValid.length > CONTEXT_BATCH_CAP) {
    return "Invalid stillValid";
  }
  for (const ping of body.stillValid) {
    if (
      !isPlainObject(ping) ||
      !hasExactKeys(ping, ["namespace", "key", "screenGroup", "observationHash"])
    ) {
      return "Invalid ping";
    }
    if (
      !isBoundedString(ping.namespace, MAX_NAMESPACE_LENGTH) ||
      !isBoundedString(ping.key, MAX_KEY_LENGTH) ||
      !isBoundedString(ping.screenGroup, CONTEXT_SCREEN_GROUP_MAX) ||
      !isBoundedString(ping.observationHash, CONTEXT_HASH_MAX)
    ) {
      return "Invalid ping";
    }
  }
  return null;
};

// --- route table -------------------------------------------------------------

interface RouteRule {
  method: string;
  /** Pattern segments; ":name" marks a parameter (decoded + bounds-checked). */
  segments: string[];
  /** Allowed query keys; absent means no query string permitted. */
  query?: Record<string, QueryValidator>;
  /** Validator for the parsed JSON body; absent means no body permitted. */
  body?: BodyValidator;
  /** Route is context telemetry — requires the session's collectContext opt-in. */
  telemetry?: boolean;
  /** Name of the path parameter that must equal the session's projectId. */
  projectIdParam?: string;
}

export interface ProxyRouteContractEntry {
  method: string;
  path: string;
  query: string[];
  body: boolean;
  telemetry: boolean;
}

/**
 * The complete set of API calls the editor runtime makes. Sources:
 * plugin-in-context-editor (translationService, languageService, collector
 * transport) and plugin-fetch-loader (project info + translations/export).
 * Keep this table in sync when the SDK adds an endpoint — nothing outside it
 * is reachable through the proxy.
 */
const ROUTES: RouteRule[] = [
  { method: "GET", segments: ["v1", "project"] },
  { method: "GET", segments: ["api", "v1", "api", "project"] },
  { method: "GET", segments: ["v1", "project", "locales"] },
  { method: "GET", segments: ["v1", "translations"], query: EXPORT_QUERY },
  {
    method: "GET",
    segments: ["v1", "projects", ":projectId", "export"],
    query: EXPORT_QUERY,
    projectIdParam: "projectId",
  },
  {
    method: "GET",
    segments: ["api", "v1", "api", "projects", ":projectId", "export"],
    query: EXPORT_QUERY,
    projectIdParam: "projectId",
  },
  { method: "GET", segments: ["v1", "keys", ":namespace", ":key"] },
  { method: "PUT", segments: ["v1", "keys"], body: validateSaveKeyBody },
  { method: "DELETE", segments: ["v1", "keys", ":namespace", ":key"] },
  {
    method: "POST",
    segments: ["v1", "context", "handshake"],
    body: validateHandshakeBody,
    telemetry: true,
  },
  {
    method: "POST",
    segments: ["v1", "context", "usages"],
    body: validateUsagesBody,
    telemetry: true,
  },
];

/**
 * Serializable view of the enforced proxy surface. Cross-repository CI compares
 * this shape with the SDK-owned contract and the platform OpenAPI document.
 */
export const PROXY_ROUTE_CONTRACT: ProxyRouteContractEntry[] = ROUTES.map((route) => ({
  method: route.method,
  path: `/${route.segments
    .map((segment) => (segment.startsWith(":") ? `{${segment.slice(1)}}` : segment))
    .join("/")}`,
  query: Object.keys(route.query ?? {}).sort(),
  body: Boolean(route.body),
  telemetry: Boolean(route.telemetry),
}));

const MAX_PARAM_LENGTH = 512;

/**
 * Match a decoded-per-segment pathname against a rule. Returns extracted
 * params, or null when the rule does not match.
 */
function matchSegments(pathSegments: string[], rule: RouteRule): Record<string, string> | null {
  if (pathSegments.length !== rule.segments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < rule.segments.length; i++) {
    const pattern = rule.segments[i];
    const rawSegment = pathSegments[i];

    if (pattern.startsWith(":")) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(rawSegment);
      } catch {
        return null;
      }
      if (!isBoundedString(decoded, MAX_PARAM_LENGTH)) return null;
      // A decoded slash would change the effective path on some backends.
      if (decoded.includes("/") || decoded.includes("\\")) return null;
      params[pattern.slice(1)] = decoded;
    } else if (rawSegment !== pattern) {
      return null;
    }
  }
  return params;
}

/**
 * Validate an untrusted proxy request payload against the fixed API base URL
 * and the session's facts. Returns the fully resolved request or a rejection
 * reason. Never throws.
 */
export function validateProxyRequest(
  payload: unknown,
  apiBaseUrl: string,
  ctx: ProxySessionContext,
): ProxyValidationResult {
  if (!isPlainObject(payload)) {
    return { ok: false, error: "Malformed proxy request" };
  }

  const { id, path, method, body, keepalive } = payload as Partial<ApiProxyRequestPayload>;

  if (typeof id !== "string" || id.length === 0 || id.length > 128) {
    return { ok: false, error: "Missing or invalid request id" };
  }

  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return { ok: false, error: "Missing or invalid path" };
  }

  // Require an origin-relative path: no absolute URLs, no protocol-relative
  // ("//host") forms, no backslash tricks.
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return { ok: false, error: "Path must be origin-relative" };
  }

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(apiBaseUrl);
    resolved = new URL(path, base);
  } catch {
    return { ok: false, error: "Path failed to parse" };
  }

  if (resolved.origin !== base.origin) {
    return { ok: false, error: "Path escapes the API origin" };
  }
  if (resolved.hash || resolved.username || resolved.password) {
    return { ok: false, error: "Path contains forbidden components" };
  }

  if (typeof method !== "undefined" && typeof method !== "string") {
    return { ok: false, error: "Invalid method" };
  }
  const resolvedMethod = (method ?? "GET").toUpperCase();

  // Split the (still percent-encoded) pathname into segments. The URL parser
  // has already normalized dot segments, including percent-encoded forms.
  const pathSegments = resolved.pathname.split("/").filter((segment) => segment.length > 0);
  if (resolved.pathname.endsWith("/")) {
    return { ok: false, error: "Trailing slash not allowed" };
  }

  let matched: { rule: RouteRule; params: Record<string, string> } | null = null;
  for (const rule of ROUTES) {
    const params = matchSegments(pathSegments, rule);
    if (params) {
      if (rule.method !== resolvedMethod) {
        // Path is known but method is not permitted for it — keep scanning in
        // case another rule covers this method, otherwise reject below.
        continue;
      }
      matched = { rule, params };
      break;
    }
  }
  if (!matched) {
    return { ok: false, error: `Not an allowed API call: ${resolvedMethod} ${resolved.pathname}` };
  }
  const { rule, params } = matched;

  // --- telemetry gate ---
  if (rule.telemetry && !ctx.collectContext) {
    return { ok: false, error: "Context telemetry is disabled for this session" };
  }

  // --- project binding ---
  if (rule.projectIdParam) {
    const sessionProjectId =
      ctx.projectId === undefined || ctx.projectId === null ? null : String(ctx.projectId);
    if (sessionProjectId === null || params[rule.projectIdParam] !== sessionProjectId) {
      return { ok: false, error: "Project id does not match this session" };
    }
  }

  // --- query validation ---
  const queryKeys: string[] = [];
  for (const [key] of resolved.searchParams) queryKeys.push(key);
  if (new Set(queryKeys).size !== queryKeys.length) {
    return { ok: false, error: "Duplicate query parameters" };
  }
  for (const key of queryKeys) {
    const validator = rule.query?.[key];
    if (!validator) {
      return { ok: false, error: `Unexpected query parameter: ${key}` };
    }
    const value = resolved.searchParams.get(key) ?? "";
    if (value.length > 4096 || !validator(value)) {
      return { ok: false, error: `Invalid query parameter: ${key}` };
    }
  }

  // --- body validation ---
  if (typeof body !== "undefined") {
    if (typeof body !== "string") {
      return { ok: false, error: "Body must be a string" };
    }
    if (!rule.body) {
      return { ok: false, error: "This API call does not accept a body" };
    }
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return { ok: false, error: "Body too large" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { ok: false, error: "Body is not valid JSON" };
    }
    if (!withinDepth(parsed, MAX_JSON_DEPTH + 2)) {
      return { ok: false, error: "Body too deeply nested" };
    }
    const bodyError = rule.body(parsed, ctx);
    if (bodyError) {
      return { ok: false, error: bodyError };
    }
  } else if (rule.body) {
    return { ok: false, error: "This API call requires a body" };
  }

  return {
    ok: true,
    id,
    url: resolved.toString(),
    method: resolvedMethod,
    body,
    keepalive: keepalive === true,
  };
}
