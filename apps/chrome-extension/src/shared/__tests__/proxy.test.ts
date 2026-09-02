/**
 * Behavioural contract of the proxy request sanitizer.
 *
 * Every request reaching validateProxyRequest is attacker-controlled, so the
 * rejection *reason* is part of the contract, not a debugging aid: asserting
 * it pins which guard fired and stops one guard from silently standing in for
 * another. Imports stay inside this package on purpose — the cross-repository
 * checks (contracts/ document, SDK wire fixture) live in
 * proxy-crossrepo.test.ts so this suite still loads from an isolated copy of
 * the package.
 */
import { describe, it, expect } from "vitest";
import { validateProxyRequest, type ProxySessionContext } from "../proxy";
import wireFixture from "../__fixtures__/wire-observation.fixture.json";

type Json = Record<string, unknown>;

const BASE = "https://api.comvi.io";

const CTX: ProxySessionContext = {
  origin: "https://app.example.com",
  projectId: 42,
  collectContext: false,
};

const TELEMETRY_CTX: ProxySessionContext = { ...CTX, collectContext: true };

/** Documented bounds, restated so a changed constant fails a test rather than drifting silently. */
const MAX_PATH_LENGTH = 2048;
const MAX_ID_LENGTH = 128;
const MAX_PARAM_LENGTH = 512;
const MAX_KEY_LENGTH = 768;
const MAX_NAMESPACE_LENGTH = 255;
const MAX_TRANSLATION_VALUE_LENGTH = 65_536;
const MAX_BODY_BYTES = 1_000_000;
const MAX_SCREEN_GROUP_LENGTH = 512;
const MAX_HASH_LENGTH = 64;

function req(overrides: Json = {}) {
  return { id: "req-1", path: "/v1/project", method: "GET", ...overrides };
}

function expectOk(payload: Json, ctx: ProxySessionContext = CTX) {
  const result = validateProxyRequest(req(payload), BASE, ctx);
  expect(result, `expected acceptance, got ${JSON.stringify(result)}`).toMatchObject({ ok: true });
  return result as Extract<ReturnType<typeof validateProxyRequest>, { ok: true }>;
}

function expectRejected(payload: Json, error: string, ctx: ProxySessionContext = CTX) {
  expect(validateProxyRequest(req(payload), BASE, ctx)).toEqual({ ok: false, error });
}

// --- payload builders --------------------------------------------------------

function savePayload(overrides: Json = {}): Json {
  return {
    key: "hero.title",
    namespace: "common",
    isPlural: false,
    translations: { en: { value: "Hello", status: "not_reviewed" } },
    ...overrides,
  };
}

function savePut(body: unknown, overrides: Json = {}): Json {
  return { path: "/v1/keys", method: "PUT", body: JSON.stringify(body), ...overrides };
}

function observation(): Json {
  return structuredClone(wireFixture.items[0]) as unknown as Json;
}

function semanticOf(source: Json): Json {
  return source.semantic as Json;
}

function observationWithSemantic(patch: Json): Json {
  const item = observation();
  item.semantic = { ...semanticOf(item), ...patch };
  return item;
}

function observationWithAncestry(ancestry: unknown): Json {
  return observationWithSemantic({ ancestry });
}

function ancestor(patch: Json = {}): Json {
  return { tag: "div", role: null, containerType: "generic", hasTitle: false, ...patch };
}

function observationWithConstraints(hardPatch: Json, softPatch: Json = {}): Json {
  const item = observation();
  const constraints = item.constraints as Json;
  item.constraints = {
    hard: { ...(constraints.hard as Json), ...hardPatch },
    soft: { ...(constraints.soft as Json), ...softPatch },
  };
  return item;
}

function neighbor(patch: Json = {}): Json {
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

function observationWithNeighbors(neighbors: unknown): Json {
  const item = observation();
  item.neighbors = neighbors;
  return item;
}

function spatial(patch: Json = {}): Json {
  return {
    rect: { x: 1, y: 2, w: 100, h: 20 },
    centerPoint: { x: 51, y: 12 },
    readingOrderIndex: 1,
    ...patch,
  };
}

function observationWithSpatial(value: unknown): Json {
  const item = observation();
  item.spatial = value;
  return item;
}

function ping(patch: Json = {}): Json {
  return {
    namespace: "common",
    key: "checkout.title",
    screenGroup: "/checkout",
    observationHash: "abc123",
    ...patch,
  };
}

function usagesBody(overrides: Json = {}): Json {
  return {
    origin: TELEMETRY_CTX.origin,
    hashFnVersion: 1,
    items: structuredClone(wireFixture.items) as unknown as Json[],
    stillValid: [ping()],
    ...overrides,
  };
}

function usagesPost(body: unknown, overrides: Json = {}): Json {
  return {
    path: "/v1/context/usages",
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...overrides,
  };
}

function handshakePost(body: unknown): Json {
  return { path: "/v1/context/handshake", method: "POST", body: JSON.stringify(body) };
}

/** One observation carrying `item`, so a single field can be judged in isolation. */
function itemsOf(item: unknown): Json {
  return usagesBody({ items: [item] });
}

// --- size helpers ------------------------------------------------------------

/** Comma-separated VALID_ID list whose serialized length is exactly `total`. */
function idListOfLength(total: number, itemMax: number): string {
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
function translationsPathOfLength(length: number): string {
  const prefix = "/v1/translations?namespaces=";
  return prefix + idListOfLength(length - prefix.length, 128);
}

/** A valid save payload serialized to exactly `bytes` UTF-8 bytes. */
function savePayloadOfBytes(bytes: number): string {
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
function nestedObject(depth: number): unknown {
  let value: unknown = "x";
  for (let i = 0; i < depth; i++) value = { n: value };
  return value;
}

/** `depth` nested arrays wrapping a string. */
function nestedArray(depth: number): unknown {
  let value: unknown = "x";
  for (let i = 0; i < depth; i++) value = [value];
  return value;
}

/**
 * JSON cannot express Infinity, but `1e999` overflows to it on parse — the
 * only way an untrusted body can smuggle a non-finite number past JSON.parse.
 */
function withOverflowingNumber(body: Json, marker: string): string {
  return JSON.stringify(body).replace(`"${marker}"`, "1e999");
}

// --- positive contract: every call the SDK editor actually makes -------------

describe("proxy contract — allowed SDK calls", () => {
  it("GET /v1/project (key validation, project info)", () => {
    expect(expectOk({ path: "/v1/project" }).url).toBe("https://api.comvi.io/v1/project");
  });

  it("GET /api/v1/api/project (legacy deployments)", () => {
    expectOk({ path: "/api/v1/api/project" });
  });

  it("GET /v1/project/locales (languageService)", () => {
    expectOk({ path: "/v1/project/locales" });
  });

  it("GET /v1/translations without query (getAllTranslationKeys)", () => {
    expectOk({ path: "/v1/translations" });
  });

  it("GET /v1/translations with locales/namespaces query (fetch-loader)", () => {
    expectOk({ path: "/v1/translations?locales=en&namespaces=common,checkout" });
  });

  it("GET /v1/projects/:id/export bound to the session project", () => {
    expectOk({ path: "/v1/projects/42/export?locales=en&namespaces=common" });
  });

  it("GET /api/v1/api/projects/:id/export (legacy export)", () => {
    expectOk({ path: "/api/v1/api/projects/42/export?locales=en&namespaces=common" });
  });

  it("GET /v1/keys/:ns/:key with encoded params", () => {
    const result = expectOk({ path: `/v1/keys/common/${encodeURIComponent("hero.title")}` });
    expect(result.url).toContain("/v1/keys/common/hero.title");
  });

  it("PUT /v1/keys with a valid save payload", () => {
    expectOk(savePut(savePayload()));
  });

  it("DELETE /v1/keys/:ns/:key", () => {
    expectOk({ path: "/v1/keys/common/hero.title", method: "DELETE" });
  });

  it("POST /v1/context/handshake when telemetry is enabled", () => {
    expectOk(handshakePost({ keys: [{ namespace: "common", key: "hero.title" }] }), TELEMETRY_CTX);
  });

  it("POST /v1/context/usages when telemetry is enabled and origin matches", () => {
    expectOk(usagesPost(usagesBody()), TELEMETRY_CTX);
  });

  it("is accepted by the extension proxy contract exactly as serialized by the SDK", () => {
    expectOk(usagesPost(usagesBody({ items: wireFixture.items })), TELEMETRY_CTX);
  });

  it("accepts the API's optional spatial observation shape", () => {
    expectOk(usagesPost(itemsOf(observationWithSpatial(spatial()))), TELEMETRY_CTX);
  });

  it("returns the resolved absolute URL, method and body for the service worker to send", () => {
    const body = JSON.stringify(savePayload());
    const result = expectOk({ path: "/v1/keys", method: "PUT", body });
    expect(result).toEqual({
      ok: true,
      id: "req-1",
      url: "https://api.comvi.io/v1/keys",
      method: "PUT",
      body,
      keepalive: false,
    });
  });
});

// --- request envelope --------------------------------------------------------

describe("proxy contract — request envelope", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "str"],
    ["a number", 42],
    ["an array", []],
  ])("rejects a payload that is %s", (_label, payload) => {
    expect(validateProxyRequest(payload, BASE, CTX)).toEqual({
      ok: false,
      error: "Malformed proxy request",
    });
  });

  it("rejects a request with no id at all", () => {
    expect(validateProxyRequest({ path: "/v1/project" }, BASE, CTX)).toEqual({
      ok: false,
      error: "Missing or invalid request id",
    });
  });

  it.each([
    ["an empty string", ""],
    ["a number", 42],
    ["an object", {}],
  ])("rejects an id that is %s", (_label, id) => {
    expectRejected({ id }, "Missing or invalid request id");
  });

  it("accepts an id of exactly the 128-character limit", () => {
    const id = "i".repeat(MAX_ID_LENGTH);
    expect(expectOk({ id }).id).toBe(id);
  });

  it("rejects an id one character past the limit", () => {
    expectRejected({ id: "i".repeat(MAX_ID_LENGTH + 1) }, "Missing or invalid request id");
  });

  it.each([
    ["missing", undefined],
    ["an empty string", ""],
    ["a number", 42],
  ])("rejects a path that is %s", (_label, path) => {
    expectRejected({ path }, "Missing or invalid path");
  });

  it("accepts a path of exactly the 2048-character limit", () => {
    const path = translationsPathOfLength(MAX_PATH_LENGTH);
    expect(path).toHaveLength(MAX_PATH_LENGTH);
    expectOk({ path });
  });

  it("rejects a path one character past the limit", () => {
    expectRejected(
      { path: translationsPathOfLength(MAX_PATH_LENGTH + 1) },
      "Missing or invalid path",
    );
  });

  it("rejects a method that is not a string", () => {
    expectRejected({ method: 42 }, "Invalid method");
  });

  it("defaults a missing method to GET", () => {
    expect(validateProxyRequest({ id: "x", path: "/v1/project" }, BASE, CTX)).toMatchObject({
      ok: true,
      method: "GET",
    });
  });

  it("only coerces keepalive === true", () => {
    expect(expectOk({ keepalive: true }).keepalive).toBe(true);
    expect(expectOk({ keepalive: "yes" }).keepalive).toBe(false);
  });
});

// --- path resolution ----------------------------------------------------------

describe("proxy contract — path resolution", () => {
  it.each([
    ["an absolute URL", "https://evil.example/v1/project"],
    ["a protocol-relative host", "//evil.example/v1/project"],
    ["a path with no leading slash", "v1/project"],
    ["a backslash", "/\\evil.example/v1/project"],
  ])("rejects %s before resolving it", (_label, path) => {
    expectRejected({ path }, "Path must be origin-relative");
  });

  it("rejects a path whose stripped whitespace turns it protocol-relative", () => {
    // The URL parser removes tab/newline characters, so "/\t/host" resolves as "//host".
    expectRejected({ path: "/\t/evil.example/v1/project" }, "Path escapes the API origin");
  });

  it("rejects a fragment, which would not survive the round trip", () => {
    expectRejected({ path: "/v1/project#top" }, "Path contains forbidden components");
  });

  it("reports an unparseable API base instead of throwing", () => {
    expect(validateProxyRequest(req(), "not a url", CTX)).toEqual({
      ok: false,
      error: "Path failed to parse",
    });
  });

  it.each(["/v1/project/", "/"])("rejects the trailing slash in %s", (path) => {
    expectRejected({ path }, "Trailing slash not allowed");
  });

  it.each([
    ["/v1/../admin/users", "/admin/users"],
    ["/v1/%2e%2e/admin/users", "/admin/users"],
  ])("normalizes traversal in %s and then rejects the result", (path, normalized) => {
    expectRejected({ path }, `Not an allowed API call: GET ${normalized}`);
  });
});

// --- route/method authorization ---------------------------------------------

describe("proxy contract — route and method rejection", () => {
  it.each([
    "/v1/organizations",
    "/v1/members",
    "/v1/api-keys",
    "/v1/admin/users",
    "/v1/projects/42",
    "/v1/projects",
    "/v1/keys",
    "/v2/project",
  ])("rejects the unrelated route GET %s locally", (path) => {
    expectRejected({ path }, `Not an allowed API call: GET ${path}`);
  });

  it.each([
    ["/v1/project", "POST"],
    ["/v1/project", "DELETE"],
    ["/v1/keys/common/x", "PUT"],
    ["/v1/translations", "PUT"],
  ])("rejects the known path %s with the unpermitted method %s", (path, method) => {
    expectRejected({ path, method }, `Not an allowed API call: ${method} ${path}`);
  });

  it("rejects a known telemetry path with a wrong method before the telemetry gate", () => {
    expectRejected(
      { path: "/v1/context/usages", method: "GET" },
      "Not an allowed API call: GET /v1/context/usages",
      TELEMETRY_CTX,
    );
  });

  it.each(["PATCH", "OPTIONS", "HEAD", "TRACE", "CONNECT"])(
    "rejects the method %s, which is outside the contract entirely",
    (method) => {
      expectRejected({ method }, `Not an allowed API call: ${method} /v1/project`);
    },
  );

  it("accepts a path parameter of exactly the 512-character limit", () => {
    expectOk({ path: `/v1/keys/common/${"k".repeat(MAX_PARAM_LENGTH)}` });
  });

  it("rejects a path parameter one character past the limit", () => {
    const key = "k".repeat(MAX_PARAM_LENGTH + 1);
    expectRejected(
      { path: `/v1/keys/common/${key}` },
      `Not an allowed API call: GET /v1/keys/common/${key}`,
    );
  });

  it.each([
    ["a decoded slash", "%2Fetc%2Fpasswd"],
    ["a decoded backslash", "%5Cetc%5Cpasswd"],
    ["a control character", "%00"],
    ["an undecodable escape", "%E0%A4%A"],
  ])("rejects a path parameter containing %s", (_label, segment) => {
    expectRejected(
      { path: `/v1/keys/common/${segment}` },
      `Not an allowed API call: GET /v1/keys/common/${segment}`,
    );
  });
});

// --- project binding ----------------------------------------------------------

describe("proxy contract — project binding", () => {
  const exportPath = (projectId: string) =>
    `/v1/projects/${projectId}/export?locales=en&namespaces=common`;

  it("rejects exports for a different project id", () => {
    expectRejected({ path: exportPath("999") }, "Project id does not match this session");
  });

  it("matches string project ids too", () => {
    expectOk({ path: exportPath("abc") }, { ...CTX, projectId: "abc" });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
  ])(
    "rejects an export addressed to the literal %s when the session has no project id",
    (literal, projectId) => {
      expectRejected({ path: exportPath(literal) }, "Project id does not match this session", {
        ...CTX,
        projectId: projectId as undefined,
      });
    },
  );

  it("rejects a numbered export when the session has no project id", () => {
    expectRejected({ path: exportPath("42") }, "Project id does not match this session", {
      ...CTX,
      projectId: undefined,
    });
  });
});

// --- query validation ----------------------------------------------------------

describe("proxy contract — query validation", () => {
  it.each([
    ["/v1/project?debug=1", "debug"],
    ["/v1/translations?locales=en&admin=true", "admin"],
  ])("rejects %s naming the unexpected parameter", (path, key) => {
    expectRejected({ path }, `Unexpected query parameter: ${key}`);
  });

  it("rejects duplicate query keys", () => {
    expectRejected(
      { path: "/v1/translations?locales=en&locales=de" },
      "Duplicate query parameters",
    );
  });

  it.each([
    ["a traversal attempt", "locales=en/../../x", "locales"],
    ["an empty value", "namespaces=", "namespaces"],
    ["an empty item between commas", "locales=en,,de", "locales"],
    ["a malformed second item", "locales=en,de/../x", "locales"],
    ["an item past its length cap", `locales=${"a".repeat(65)}`, "locales"],
    ["more items than the cap allows", `locales=${Array(21).fill("en").join(",")}`, "locales"],
  ])("rejects %s", (_label, query, key) => {
    expectRejected({ path: `/v1/translations?${query}` }, `Invalid query parameter: ${key}`);
  });

  it("accepts a locale list at exactly its item cap and item length", () => {
    const locales = Array(20).fill("l".repeat(64)).join(",");
    expectOk({ path: `/v1/translations?locales=${locales}` });
  });

  it("accepts a namespace list at exactly its item cap", () => {
    const namespaces = Array(50).fill("ns").join(",");
    expectOk({ path: `/v1/translations?namespaces=${namespaces}` });
  });
});

// --- body envelope -----------------------------------------------------------

describe("proxy contract — body envelope", () => {
  it("rejects bodies on routes without one", () => {
    expectRejected({ path: "/v1/project", body: "{}" }, "This API call does not accept a body");
  });

  it("requires a body where the contract has one", () => {
    expectRejected({ path: "/v1/keys", method: "PUT" }, "This API call requires a body");
  });

  it("rejects a body that is not a string", () => {
    expectRejected(
      { path: "/v1/keys", method: "PUT", body: { key: "x" } },
      "Body must be a string",
    );
  });

  it("rejects a body that is not valid JSON", () => {
    expectRejected({ path: "/v1/keys", method: "PUT", body: "{oops" }, "Body is not valid JSON");
  });

  it("accepts a body of exactly the 1,000,000-byte limit", () => {
    const body = savePayloadOfBytes(MAX_BODY_BYTES);
    expect(new TextEncoder().encode(body)).toHaveLength(MAX_BODY_BYTES);
    expectOk({ path: "/v1/keys", method: "PUT", body });
  });

  it("rejects a body one byte past the limit", () => {
    expectRejected(
      { path: "/v1/keys", method: "PUT", body: savePayloadOfBytes(MAX_BODY_BYTES + 1) },
      "Body too large",
    );
  });

  it("measures the body limit in UTF-8 bytes, not JS string length", () => {
    // ~350k emoji -> ~700k UTF-16 code units (under 1M) but ~1.4MB UTF-8.
    const body = JSON.stringify(
      savePayload({ translations: { en: { value: "😀".repeat(350_000), status: "translated" } } }),
    );
    expect(body.length).toBeLessThan(MAX_BODY_BYTES);
    expectRejected({ path: "/v1/keys", method: "PUT", body }, "Body too large");
  });

  it("accepts an object nesting exactly at the depth limit, judging it on its fields", () => {
    expectRejected(
      usagesPost(usagesBody({ deep: nestedObject(9) })),
      "Unexpected body field: deep",
      TELEMETRY_CTX,
    );
  });

  it("rejects an object nesting one level past the depth limit", () => {
    expectRejected(
      usagesPost(usagesBody({ deep: nestedObject(10) })),
      "Body too deeply nested",
      TELEMETRY_CTX,
    );
  });

  it("counts array nesting toward the depth limit as well", () => {
    expectRejected(
      usagesPost(usagesBody({ deep: nestedArray(10) })),
      "Body too deeply nested",
      TELEMETRY_CTX,
    );
  });
});

// --- PUT /v1/keys body ---------------------------------------------------------

describe("proxy contract — save payload", () => {
  it.each([
    ["null", null],
    ["a number", 42],
    ["an array", []],
  ])("rejects a save body that is %s", (_label, body) => {
    expectRejected(savePut(body), "Body must be an object");
  });

  it("rejects an unexpected extra field", () => {
    expectRejected(savePut(savePayload({ role: "admin" })), "Invalid save payload fields");
  });

  it("rejects a payload missing a required field, even when other fields are present", () => {
    const { translations: _dropped, ...incomplete } = savePayload();
    expectRejected(savePut(incomplete), "Invalid save payload fields");
  });

  it.each([
    ["empty", ""],
    ["a number", 42],
    ["an array of strings", ["hero"]],
    ["carrying a newline", "hero\ntitle"],
    ["past its length cap", "k".repeat(MAX_KEY_LENGTH + 1)],
  ])("rejects a key that is %s", (_label, key) => {
    expectRejected(savePut(savePayload({ key })), "Invalid key");
  });

  it("accepts a key of exactly its length cap", () => {
    expectOk(savePut(savePayload({ key: "k".repeat(MAX_KEY_LENGTH) })));
  });

  it("accepts a single-character key", () => {
    expectOk(savePut(savePayload({ key: "a" })));
  });

  it.each([
    ["empty", ""],
    ["a number", 42],
    ["past its length cap", "n".repeat(MAX_NAMESPACE_LENGTH + 1)],
  ])("rejects a namespace that is %s", (_label, namespace) => {
    expectRejected(savePut(savePayload({ namespace })), "Invalid namespace");
  });

  it("accepts a namespace of exactly its length cap", () => {
    expectOk(savePut(savePayload({ namespace: "n".repeat(MAX_NAMESPACE_LENGTH) })));
  });

  it("rejects a non-boolean isPlural", () => {
    expectRejected(savePut(savePayload({ isPlural: "no" })), "Invalid isPlural");
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a string", "en"],
  ])("rejects translations given as %s", (_label, translations) => {
    expectRejected(savePut(savePayload({ translations })), "Invalid translations");
  });

  it("accepts exactly 100 translation entries", () => {
    const translations: Json = {};
    for (let i = 0; i < 100; i++) translations[`l${i}`] = { value: "v", status: "translated" };
    expectOk(savePut(savePayload({ translations })));
  });

  it("rejects a 101st translation entry", () => {
    const translations: Json = {};
    for (let i = 0; i < 101; i++) translations[`l${i}`] = { value: "v", status: "translated" };
    expectRejected(savePut(savePayload({ translations })), "Too many translations");
  });

  it.each([
    ["empty", ""],
    ["past its length cap", "l".repeat(51)],
    ["carrying a control character", "e n"],
  ])("rejects a language code that is %s", (_label, lang) => {
    const translations = { [lang]: { value: "v", status: "translated" } };
    expectRejected(savePut(savePayload({ translations })), "Invalid language code");
  });

  it.each([
    ["not an object", "Hello"],
    ["missing status", { value: "Hello" }],
    ["carrying an extra field", { value: "x", status: "not_reviewed", privileged: true }],
  ])("rejects a translation entry that is %s", (_label, entry) => {
    expectRejected(
      savePut(savePayload({ translations: { en: entry } })),
      "Invalid translation entry",
    );
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["past its length cap", "x".repeat(MAX_TRANSLATION_VALUE_LENGTH + 1)],
  ])("rejects a translation value that is %s", (_label, value) => {
    const translations = { en: { value, status: "translated" } };
    expectRejected(savePut(savePayload({ translations })), "Invalid translation value");
  });

  it("accepts a translation value of exactly its length cap", () => {
    const value = "x".repeat(MAX_TRANSLATION_VALUE_LENGTH);
    expectOk(savePut(savePayload({ translations: { en: { value, status: "translated" } } })));
  });

  it.each(["translated", "not_reviewed", "not_translated"])("accepts the status %s", (status) => {
    expectOk(savePut(savePayload({ translations: { en: { value: "v", status } } })));
  });

  it.each([
    ["an unknown workflow state", "draft"],
    ["a boolean", true],
  ])("rejects a translation status that is %s", (_label, status) => {
    const translations = { en: { value: "v", status } };
    expectRejected(savePut(savePayload({ translations })), "Invalid translation status");
  });
});

// --- POST /v1/context/handshake body -------------------------------------------

describe("proxy contract — handshake payload", () => {
  it("rejects a handshake body that is not an object", () => {
    expectRejected(handshakePost(null), "Body must be an object", TELEMETRY_CTX);
  });

  it("names an unexpected envelope field", () => {
    expectRejected(
      handshakePost({ keys: [], projectId: 7 }),
      "Unexpected body field: projectId",
      TELEMETRY_CTX,
    );
  });

  it.each([
    ["not an array", { keys: {} }],
    ["past the batch cap", { keys: Array(101).fill({ namespace: "a", key: "b" }) }],
  ])("rejects keys that are %s", (_label, body) => {
    expectRejected(handshakePost(body), "Invalid keys", TELEMETRY_CTX);
  });

  it("accepts exactly 100 key references", () => {
    expectOk(
      handshakePost({ keys: Array(100).fill({ namespace: "common", key: "hero" }) }),
      TELEMETRY_CTX,
    );
  });

  it.each([
    ["carrying an extra field", { namespace: "common", key: "hero", keyId: 123 }],
    ["missing the key", { namespace: "common" }],
    ["not an object", "common:hero"],
    ["holding an empty namespace", { namespace: "", key: "hero" }],
    ["holding an empty key", { namespace: "common", key: "" }],
    ["holding an oversized namespace", { namespace: "n".repeat(256), key: "hero" }],
    ["holding an oversized key", { namespace: "common", key: "k".repeat(769) }],
  ])("rejects a key reference %s", (_label, ref) => {
    expectRejected(handshakePost({ keys: [ref] }), "Invalid key ref", TELEMETRY_CTX);
  });

  it("checks every key reference, not just the first", () => {
    const keys = [{ namespace: "common", key: "hero" }, { namespace: "common" }];
    expectRejected(handshakePost({ keys }), "Invalid key ref", TELEMETRY_CTX);
  });
});

// --- POST /v1/context/usages envelope -------------------------------------------

describe("proxy contract — usages envelope", () => {
  it("rejects a usages body that is not an object", () => {
    expectRejected(usagesPost(null), "Body must be an object", TELEMETRY_CTX);
  });

  it("names an unexpected envelope field", () => {
    expectRejected(
      usagesPost(usagesBody({ env: "production" })),
      "Unexpected body field: env",
      TELEMETRY_CTX,
    );
  });

  it.each([
    ["a different origin", "https://other.example"],
    ["no origin at all", undefined],
  ])("rejects telemetry reported for %s", (_label, origin) => {
    expectRejected(usagesPost(usagesBody({ origin })), "Telemetry origin mismatch", TELEMETRY_CTX);
  });

  it.each([
    ["a string", "1"],
    ["fractional", 1.5],
    ["negative", -1],
  ])("rejects a hashFnVersion that is %s", (_label, hashFnVersion) => {
    expectRejected(
      usagesPost(usagesBody({ hashFnVersion })),
      "Invalid hashFnVersion",
      TELEMETRY_CTX,
    );
  });

  it.each([
    ["not an array", {}],
    ["a string", "nope"],
    ["past the batch cap", Array(101).fill(null)],
  ])("rejects items that are %s", (_label, items) => {
    expectRejected(usagesPost(usagesBody({ items })), "Invalid items", TELEMETRY_CTX);
  });

  it("accepts exactly 100 observations", () => {
    expectOk(usagesPost(usagesBody({ items: Array(100).fill(observation()) })), TELEMETRY_CTX);
  });

  it("rejects a 101st observation even when every one of them is well-formed", () => {
    expectRejected(
      usagesPost(usagesBody({ items: Array(101).fill(observation()) })),
      "Invalid items",
      TELEMETRY_CTX,
    );
  });

  it("checks every observation, not just the first", () => {
    expectOk(usagesPost(usagesBody({ items: [observation()] })), TELEMETRY_CTX);
    expectRejected(
      usagesPost(usagesBody({ items: [observation(), {}] })),
      "Invalid items",
      TELEMETRY_CTX,
    );
  });

  it.each([
    ["not an array", {}],
    ["past the batch cap", Array(101).fill(ping())],
  ])("rejects stillValid that is %s", (_label, stillValid) => {
    expectRejected(usagesPost(usagesBody({ stillValid })), "Invalid stillValid", TELEMETRY_CTX);
  });

  it("accepts exactly 100 still-valid pings", () => {
    expectOk(usagesPost(usagesBody({ stillValid: Array(100).fill(ping()) })), TELEMETRY_CTX);
  });

  it.each([
    ["not an object", "common:hero"],
    ["carrying an extra field", ping({ profileHash: "not-allowed" })],
    ["missing observationHash", { namespace: "a", key: "b", screenGroup: "/" }],
    ["holding an empty namespace", ping({ namespace: "" })],
    ["holding an oversized namespace", ping({ namespace: "n".repeat(MAX_NAMESPACE_LENGTH + 1) })],
    ["holding an empty key", ping({ key: "" })],
    ["holding an oversized key", ping({ key: "k".repeat(MAX_KEY_LENGTH + 1) })],
    ["holding an empty screenGroup", ping({ screenGroup: "" })],
    [
      "holding an oversized screenGroup",
      ping({ screenGroup: "s".repeat(MAX_SCREEN_GROUP_LENGTH + 1) }),
    ],
    ["holding an empty observationHash", ping({ observationHash: "" })],
    [
      "holding an oversized observationHash",
      ping({ observationHash: "h".repeat(MAX_HASH_LENGTH + 1) }),
    ],
  ])("rejects a still-valid ping %s", (_label, entry) => {
    expectRejected(usagesPost(usagesBody({ stillValid: [entry] })), "Invalid ping", TELEMETRY_CTX);
  });

  it("checks every still-valid ping, not just the first", () => {
    expectRejected(
      usagesPost(usagesBody({ stillValid: [ping(), ping({ key: "" })] })),
      "Invalid ping",
      TELEMETRY_CTX,
    );
  });
});

// --- observation shape ----------------------------------------------------------

describe("proxy contract — observation identity fields", () => {
  it.each([
    ["a client-controlled observationHash", { ...observation(), observationHash: "spoofed" }],
    ["an unknown uiType", { ...observation(), uiType: "text" }],
    ["an unknown translationRole", { ...observation(), translationRole: "content" }],
    ["a missing namespace", { ...observation(), namespace: undefined }],
    ["an empty namespace", { ...observation(), namespace: "" }],
    [
      "an oversized namespace",
      { ...observation(), namespace: "n".repeat(MAX_NAMESPACE_LENGTH + 1) },
    ],
    ["an oversized key", { ...observation(), key: "k".repeat(MAX_KEY_LENGTH + 1) }],
    ["an empty screenGroup", { ...observation(), screenGroup: "" }],
    [
      "an oversized screenGroup",
      { ...observation(), screenGroup: "s".repeat(MAX_SCREEN_GROUP_LENGTH + 1) },
    ],
    ["a non-object shape", "checkout.title"],
  ])("rejects an observation with %s", (_label, item) => {
    expectRejected(usagesPost(itemsOf(item)), "Invalid items", TELEMETRY_CTX);
  });
});

describe("proxy contract — observation semantic signals", () => {
  it.each([
    ["a rawText field", observationWithSemantic({ rawText: "secret" })],
    ["an undefined ariaRole", observationWithSemantic({ ariaRole: undefined })],
    ["a numeric ariaRole", observationWithSemantic({ ariaRole: 42 })],
    ["an ariaRole given as an array", observationWithSemantic({ ariaRole: ["button"] })],
    ["an oversized ariaRole", observationWithSemantic({ ariaRole: "r".repeat(65) })],
    ["an ariaRole carrying a control character", observationWithSemantic({ ariaRole: "a b" })],
    ["a numeric htmlType", observationWithSemantic({ htmlType: 42 })],
    ["an oversized htmlType", observationWithSemantic({ htmlType: "t".repeat(65) })],
    ["an unknown semanticRole", observationWithSemantic({ semanticRole: "widget" })],
    ["a non-boolean hasAriaLabel", observationWithSemantic({ hasAriaLabel: "yes" })],
    ["a non-boolean hasPlaceholder", observationWithSemantic({ hasPlaceholder: "yes" })],
    ["semantic signals that are not an object", { ...observation(), semantic: "heading" }],
  ])("rejects an observation with %s", (_label, item) => {
    expectRejected(usagesPost(itemsOf(item)), "Invalid items", TELEMETRY_CTX);
  });

  it.each([
    ["a 64-character ariaRole", observationWithSemantic({ ariaRole: "r".repeat(64) })],
    ["a 64-character htmlType", observationWithSemantic({ htmlType: "t".repeat(64) })],
  ])("accepts an observation with %s", (_label, item) => {
    expectOk(usagesPost(itemsOf(item)), TELEMETRY_CTX);
  });

  it.each([
    ["not an array", "h2 > dialog"],
    ["past the ancestry cap", [ancestor(), ancestor(), ancestor(), ancestor()]],
    ["a title on an entry", [ancestor({ title: "rendered text" })]],
    ["an entry that is not an object", ["dialog"]],
    ["an oversized tag", [ancestor({ tag: "t".repeat(33) })]],
    ["a numeric role", [ancestor({ role: 42 })]],
    ["an oversized role", [ancestor({ role: "r".repeat(65) })]],
    ["an unknown containerType", [ancestor({ containerType: "aside" })]],
    ["a non-boolean hasTitle", [ancestor({ hasTitle: "yes" })]],
    ["a bad second entry", [ancestor(), ancestor({ containerType: "aside" })]],
  ])("rejects an observation whose ancestry is %s", (_label, ancestry) => {
    expectRejected(
      usagesPost(itemsOf(observationWithAncestry(ancestry))),
      "Invalid items",
      TELEMETRY_CTX,
    );
  });

  it("accepts an ancestry at exactly the cap with a named role", () => {
    const ancestry = [
      ancestor({ role: "r".repeat(64) }),
      ancestor(),
      ancestor({ tag: "t".repeat(32) }),
    ];
    expectOk(usagesPost(itemsOf(observationWithAncestry(ancestry))), TELEMETRY_CTX);
  });
});

describe("proxy contract — observation constraints", () => {
  it.each([
    [
      "a debug flag",
      { ...observation(), constraints: { ...(observation().constraints as Json), debug: true } },
    ],
    ["constraints that are not an object", { ...observation(), constraints: "tight" }],
    [
      "hard constraints that are not an object",
      { ...observation(), constraints: { hard: "tight", soft: {} } },
    ],
  ])("rejects an observation with %s", (_label, item) => {
    expectRejected(usagesPost(itemsOf(item)), "Invalid items", TELEMETRY_CTX);
  });

  it.each([
    ["a non-boolean mustBeShort", { mustBeShort: "yes" }, {}],
    ["a non-boolean singleLine", { singleLine: "yes" }, {}],
    ["an unknown widthBucket", { widthBucket: "huge" }, {}],
    ["an extra hard field", { debug: true }, {}],
    ["a non-boolean likelyTruncated", {}, { likelyTruncated: "yes" }],
    ["a non-boolean visuallyCompact", {}, { visuallyCompact: "yes" }],
    ["an unknown visualProminence", {}, { visualProminence: "loud" }],
    ["an extra soft field", {}, { debug: true }],
  ])("rejects constraints with %s", (_label, hard, soft) => {
    expectRejected(
      usagesPost(itemsOf(observationWithConstraints(hard, soft))),
      "Invalid items",
      TELEMETRY_CTX,
    );
  });

  it.each(["tiny", "small", "medium", "large", "full"])(
    "accepts the widthBucket %s",
    (widthBucket) => {
      expectOk(usagesPost(itemsOf(observationWithConstraints({ widthBucket }))), TELEMETRY_CTX);
    },
  );

  it.each(["high", "medium", "low"])("accepts the visualProminence %s", (visualProminence) => {
    expectOk(
      usagesPost(itemsOf(observationWithConstraints({}, { visualProminence }))),
      TELEMETRY_CTX,
    );
  });
});

describe("proxy contract — observation neighbors", () => {
  it.each([
    ["not an array", "checkout.submit"],
    ["past the neighbor cap", Array(13).fill(neighbor())],
    ["holding a textContent field", [neighbor({ textContent: "secret" })]],
    ["holding an entry that is not an object", ["checkout.submit"]],
    ["holding an empty namespace", [neighbor({ namespace: "" })]],
    ["holding an empty key", [neighbor({ key: "" })]],
    ["holding an unknown semanticRole", [neighbor({ semanticRole: "widget" })]],
    ["holding an unknown relativePosition", [neighbor({ relativePosition: "behind" })]],
    ["holding an unknown containerType", [neighbor({ containerType: "aside" })]],
    ["holding an unknown sameContainerAs", [neighbor({ sameContainerAs: "aside" })]],
    ["holding a negative distance", [neighbor({ distance: -1 })]],
    ["holding a non-numeric distance", [neighbor({ distance: "101" })]],
    ["holding a negative readingOrderIndex", [neighbor({ readingOrderIndex: -1 })]],
    ["holding a fractional readingOrderIndex", [neighbor({ readingOrderIndex: 1.5 })]],
    ["holding a non-numeric readingOrderIndex", [neighbor({ readingOrderIndex: "1" })]],
    ["holding a bad second entry", [neighbor(), neighbor({ distance: -1 })]],
  ])("rejects neighbors %s", (_label, neighbors) => {
    expectRejected(
      usagesPost(itemsOf(observationWithNeighbors(neighbors))),
      "Invalid items",
      TELEMETRY_CTX,
    );
  });

  it.each([
    ["exactly the neighbor cap", Array(12).fill(neighbor())],
    ["a null sameContainerAs", [neighbor({ sameContainerAs: null })]],
    ["a zero distance", [neighbor({ distance: 0 })]],
    ["a zero readingOrderIndex", [neighbor({ readingOrderIndex: 0 })]],
    ["no neighbors at all", []],
  ])("accepts neighbors with %s", (_label, neighbors) => {
    expectOk(usagesPost(itemsOf(observationWithNeighbors(neighbors))), TELEMETRY_CTX);
  });

  it("rejects a neighbor distance that overflows to Infinity on parse", () => {
    const body = withOverflowingNumber(
      itemsOf(observationWithNeighbors([neighbor({ distance: "@@overflow" })])),
      "@@overflow",
    );
    expectRejected(usagesPost(body), "Invalid items", TELEMETRY_CTX);
  });
});

describe("proxy contract — observation spatial signals", () => {
  it.each([
    ["not an object", "1,2"],
    ["carrying an extra field", spatial({ raw: true })],
    ["missing centerPoint", { rect: { x: 1, y: 2, w: 3, h: 4 }, readingOrderIndex: 0 }],
    ["a rect that is not an object", spatial({ rect: "1,2,3,4" })],
    ["a rect carrying an extra field", spatial({ rect: { x: 1, y: 2, w: 3, h: 4, raw: true } })],
    ["a rect missing a side", spatial({ rect: { x: 1, y: 2, w: 3 } })],
    ["a non-numeric rect side", spatial({ rect: { x: "1", y: 2, w: 3, h: 4 } })],
    ["a centerPoint that is not an object", spatial({ centerPoint: "1,2" })],
    ["a non-numeric centerPoint", spatial({ centerPoint: { x: "1", y: 2 } })],
    ["a negative readingOrderIndex", spatial({ readingOrderIndex: -1 })],
    ["a fractional readingOrderIndex", spatial({ readingOrderIndex: 1.5 })],
  ])("rejects spatial signals %s", (_label, value) => {
    expectRejected(
      usagesPost(itemsOf(observationWithSpatial(value))),
      "Invalid items",
      TELEMETRY_CTX,
    );
  });

  it("accepts negative rect coordinates for content scrolled off-screen", () => {
    const value = spatial({ rect: { x: -10, y: -20, w: 100, h: 20 }, readingOrderIndex: 0 });
    expectOk(usagesPost(itemsOf(observationWithSpatial(value))), TELEMETRY_CTX);
  });

  it("rejects a rect coordinate that overflows to Infinity on parse", () => {
    const value = spatial({ rect: { x: "@@overflow", y: 2, w: 3, h: 4 } });
    const body = withOverflowingNumber(itemsOf(observationWithSpatial(value)), "@@overflow");
    expectRejected(usagesPost(body), "Invalid items", TELEMETRY_CTX);
  });
});

// --- telemetry gating -----------------------------------------------------------

describe("proxy contract — telemetry gating", () => {
  it.each([
    ["handshake", handshakePost({ keys: [] })],
    ["usages", usagesPost(usagesBody({ origin: CTX.origin }))],
  ])("blocks the %s route when collectContext is off", (_label, payload) => {
    expectRejected(payload, "Context telemetry is disabled for this session", CTX);
  });
});
