/**
 * Fixtures and assertion helpers for the proxy contract suites.
 *
 * Every request reaching validateProxyRequest is attacker-controlled, so the
 * rejection *reason* is part of the contract, not a debugging aid: asserting it
 * pins which guard fired. Imports stay inside this package on purpose, so the
 * suites load from an isolated copy (a mutation-testing sandbox, for one); the
 * cross-repository checks live in proxy-crossrepo.test.ts.
 */
import { expect } from "vitest";
import { validateProxyRequest, type ProxySessionContext } from "../proxy";
import wireFixture from "../__fixtures__/wire-observation.fixture.json";

export type Json = Record<string, unknown>;

export const BASE = "https://api.comvi.io";

export const CTX: ProxySessionContext = {
  origin: "https://app.example.com",
  projectId: 42,
  collectContext: false,
};

export const TELEMETRY_CTX: ProxySessionContext = { ...CTX, collectContext: true };

/** Documented bounds, restated so a changed constant fails a test rather than drifting silently. */
/** Fits the longest key path: 255 + 768 decoded units at 9 encoded characters each. */
export const MAX_PATH_LENGTH = "/v1/keys/".length + (255 + 768) * 9 + "/".length;
export const MAX_ID_LENGTH = 128;
export const MAX_PARAM_LENGTH = 512;
export const MAX_KEY_LENGTH = 768;
export const MAX_NAMESPACE_LENGTH = 255;
export const MAX_TRANSLATION_VALUE_LENGTH = 65_536;
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_SCREEN_GROUP_LENGTH = 512;
export const MAX_HASH_LENGTH = 64;

export function req(overrides: Json = {}) {
  return { id: "req-1", path: "/v1/project", method: "GET", ...overrides };
}

export function expectOk(payload: Json, ctx: ProxySessionContext = CTX) {
  const result = validateProxyRequest(req(payload), BASE, ctx);
  expect(result, `expected acceptance, got ${JSON.stringify(result)}`).toMatchObject({ ok: true });
  return result as Extract<ReturnType<typeof validateProxyRequest>, { ok: true }>;
}

export function expectRejected(payload: Json, error: string, ctx: ProxySessionContext = CTX) {
  expect(validateProxyRequest(req(payload), BASE, ctx)).toEqual({ ok: false, error });
}

// --- payload builders --------------------------------------------------------

export function savePayload(overrides: Json = {}): Json {
  return {
    key: "hero.title",
    namespace: "common",
    isPlural: false,
    translations: { en: { value: "Hello", status: "not_reviewed" } },
    ...overrides,
  };
}

export function savePut(body: unknown, overrides: Json = {}): Json {
  return { path: "/v1/keys", method: "PUT", body: JSON.stringify(body), ...overrides };
}

export function observation(): Json {
  return structuredClone(wireFixture.items[0]) as unknown as Json;
}

export function semanticOf(source: Json): Json {
  return source.semantic as Json;
}

export function observationWithSemantic(patch: Json): Json {
  const item = observation();
  item.semantic = { ...semanticOf(item), ...patch };
  return item;
}

export function observationWithAncestry(ancestry: unknown): Json {
  return observationWithSemantic({ ancestry });
}

export function ancestor(patch: Json = {}): Json {
  return { tag: "div", role: null, containerType: "generic", hasTitle: false, ...patch };
}

export function observationWithConstraints(hardPatch: Json, softPatch: Json = {}): Json {
  const item = observation();
  const constraints = item.constraints as Json;
  item.constraints = {
    hard: { ...(constraints.hard as Json), ...hardPatch },
    soft: { ...(constraints.soft as Json), ...softPatch },
  };
  return item;
}

export function neighbor(patch: Json = {}): Json {
  return {
    namespace: "common",
    key: "checkout.submit",
    semanticRole: "button",
    relativePosition: "below",
    containerType: "dialog",
    sameContainerAs: "dialog",
    distance: 101,
    readingOrderIndex: 1,
    ...patch,
  };
}

export function observationWithNeighbors(neighbors: unknown): Json {
  const item = observation();
  item.neighbors = neighbors;
  return item;
}

export function spatial(patch: Json = {}): Json {
  return {
    rect: { x: 1, y: 2, w: 100, h: 20 },
    centerPoint: { x: 51, y: 12 },
    readingOrderIndex: 1,
    ...patch,
  };
}

export function observationWithSpatial(value: unknown): Json {
  const item = observation();
  item.spatial = value;
  return item;
}

export function ping(patch: Json = {}): Json {
  return {
    namespace: "common",
    key: "checkout.title",
    screenGroup: "/checkout",
    observationHash: "abc123",
    ...patch,
  };
}

export function usagesBody(overrides: Json = {}): Json {
  return {
    origin: TELEMETRY_CTX.origin,
    hashFnVersion: 1,
    items: structuredClone(wireFixture.items) as unknown as Json[],
    stillValid: [ping()],
    ...overrides,
  };
}

export function usagesPost(body: unknown, overrides: Json = {}): Json {
  return {
    path: "/v1/context/usages",
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...overrides,
  };
}

export function handshakePost(body: unknown): Json {
  return { path: "/v1/context/handshake", method: "POST", body: JSON.stringify(body) };
}

/** One observation carrying `item`, so a single field can be judged in isolation. */
export function itemsOf(item: unknown): Json {
  return usagesBody({ items: [item] });
}

// --- size helpers ------------------------------------------------------------

/** Comma-separated VALID_ID list whose serialized length is exactly `total`. */
export function idListOfLength(total: number, itemMax: number): string {
  const items: string[] = [];
  let remaining = total;
  while (remaining > itemMax) {
    items.push("n".repeat(itemMax));
    remaining -= itemMax + 1;
  }
  items.push("n".repeat(remaining));
  return items.join(",");
}

/** A /v1/translations request path of exactly `length` characters. */
export function translationsPathOfLength(length: number): string {
  const prefix = "/v1/translations?namespaces=";
  return prefix + idListOfLength(length - prefix.length, 128);
}

/** A valid save payload serialized to exactly `bytes` UTF-8 bytes. */
export function savePayloadOfBytes(bytes: number): string {
  const translations: Json = {};
  for (let i = 0; i < 15; i++) {
    translations[`l${i}`] = {
      value: "x".repeat(MAX_TRANSLATION_VALUE_LENGTH),
      status: "translated",
    };
  }
  const pad = { value: "", status: "translated" };
  translations.pad = pad;
  const payload = savePayload({ translations });
  pad.value = "x".repeat(bytes - JSON.stringify(payload).length);
  return JSON.stringify(payload);
}

/** `depth` nested objects wrapping a string. */
export function nestedObject(depth: number): unknown {
  let value: unknown = "x";
  for (let i = 0; i < depth; i++) value = { n: value };
  return value;
}

/** `depth` nested arrays wrapping a string. */
export function nestedArray(depth: number): unknown {
  let value: unknown = "x";
  for (let i = 0; i < depth; i++) value = [value];
  return value;
}

/**
 * JSON cannot express Infinity, but `1e999` overflows to it on parse — the
 * only way an untrusted body can smuggle a non-finite number past JSON.parse.
 */
export function withOverflowingNumber(body: Json, marker: string): string {
  return JSON.stringify(body).replace(`"${marker}"`, "1e999");
}

// --- positive contract: every call the SDK editor actually makes -------------

// --- request envelope --------------------------------------------------------

// --- path resolution ----------------------------------------------------------

// --- route/method authorization ---------------------------------------------

// --- project binding ----------------------------------------------------------

// --- query validation ----------------------------------------------------------

// --- body envelope -----------------------------------------------------------

// --- PUT /v1/keys body ---------------------------------------------------------

// --- POST /v1/context/handshake body -------------------------------------------

// --- POST /v1/context/usages envelope -------------------------------------------

// --- observation shape ----------------------------------------------------------

// --- telemetry gating -----------------------------------------------------------
