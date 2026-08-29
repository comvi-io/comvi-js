import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROXY_ROUTE_CONTRACT, validateProxyRequest, type ProxySessionContext } from "../proxy";
import proxyContract from "../../../../../contracts/chrome-extension-proxy.json";
import wireFixture from "../__fixtures__/wire-observation.fixture.json";

const BASE = "https://api.comvi.io";

const CTX: ProxySessionContext = {
  origin: "https://app.example.com",
  projectId: 42,
  collectContext: false,
};

const TELEMETRY_CTX: ProxySessionContext = { ...CTX, collectContext: true };

function req(overrides: Record<string, unknown> = {}) {
  return { id: "req-1", path: "/v1/project", method: "GET", ...overrides };
}

function expectOk(payload: Record<string, unknown>, ctx: ProxySessionContext = CTX) {
  const result = validateProxyRequest(req(payload), BASE, ctx);
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return result as Extract<ReturnType<typeof validateProxyRequest>, { ok: true }>;
}

function expectRejected(payload: Record<string, unknown>, ctx: ProxySessionContext = CTX) {
  const result = validateProxyRequest(req(payload), BASE, ctx);
  expect(result.ok, JSON.stringify(result)).toBe(false);
  return result as Extract<ReturnType<typeof validateProxyRequest>, { ok: false }>;
}

function validObservation() {
  return wireFixture.items[0];
}

function validUsagesBody() {
  return {
    origin: TELEMETRY_CTX.origin,
    hashFnVersion: 1,
    items: wireFixture.items,
    stillValid: [{ namespace: "common", key: "cta", screenGroup: "/", observationHash: "abc123" }],
  };
}

describe("SDK telemetry wire fixture", () => {
  it("matches the SDK-generated canonical fixture when the sibling repo is available", () => {
    const sdkFixtureUrl = new URL(
      "../../../../../packages/plugin-in-context-editor/src/collector/hash/wire-observation.fixture.json",
      import.meta.url,
    );
    expect(JSON.parse(readFileSync(sdkFixtureUrl, "utf8"))).toEqual(wireFixture);
  });

  it("is accepted by the extension proxy contract exactly as serialized by the SDK", () => {
    const body = JSON.stringify(validUsagesBody());
    expectOk({ path: "/v1/context/usages", method: "POST", body }, TELEMETRY_CTX);
  });
});

describe("machine-readable proxy contract", () => {
  it("matches the route table enforced by the sanitizer", () => {
    const declared = proxyContract.routes.map(({ source: _source, ...route }) => route);
    expect(PROXY_ROUTE_CONTRACT).toEqual(declared);
  });
});

// --- positive contract: every call the SDK editor actually makes ------------

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
    const body = JSON.stringify({
      key: "hero.title",
      namespace: "common",
      isPlural: false,
      translations: { en: { value: "Hello", status: "not_reviewed" } },
    });
    expectOk({ path: "/v1/keys", method: "PUT", body });
  });

  it("DELETE /v1/keys/:ns/:key", () => {
    expectOk({ path: "/v1/keys/common/hero.title", method: "DELETE" });
  });

  it("POST /v1/context/handshake when telemetry is enabled", () => {
    const body = JSON.stringify({ keys: [{ namespace: "common", key: "hero.title" }] });
    expectOk({ path: "/v1/context/handshake", method: "POST", body }, TELEMETRY_CTX);
  });

  it("POST /v1/context/usages when telemetry is enabled and origin matches", () => {
    const body = JSON.stringify(validUsagesBody());
    expectOk({ path: "/v1/context/usages", method: "POST", body }, TELEMETRY_CTX);
  });

  it("accepts the API's optional spatial observation shape", () => {
    const observation = validObservation();
    const body = JSON.stringify({
      ...validUsagesBody(),
      items: [
        {
          ...observation,
          spatial: {
            rect: { x: 1, y: 2, w: 100, h: 20 },
            centerPoint: { x: 51, y: 12 },
            readingOrderIndex: 1,
          },
        },
      ],
    });
    expectOk({ path: "/v1/context/usages", method: "POST", body }, TELEMETRY_CTX);
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
    "/v1/keys", // GET on collection is not a contract call
    "/v2/project",
    "/",
  ])("rejects the unrelated route GET %s locally", (path) => {
    expectRejected({ path, method: "GET" });
  });

  it("rejects known paths with a wrong method", () => {
    expectRejected({ path: "/v1/project", method: "POST" });
    expectRejected({ path: "/v1/project", method: "DELETE" });
    expectRejected({ path: "/v1/keys/common/x", method: "PUT" });
    expectRejected({ path: "/v1/context/usages", method: "GET" }, TELEMETRY_CTX);
    expectRejected({ path: "/v1/translations", method: "PUT" });
  });

  it.each(["PATCH", "OPTIONS", "HEAD", "TRACE", "CONNECT"])(
    "rejects the method %s, which is outside the contract entirely",
    (method) => {
      expectRejected({ method });
    },
  );

  it("rejects trailing slashes", () => {
    expectRejected({ path: "/v1/project/" });
  });

  it("rejects absolute, protocol-relative and backslash paths", () => {
    expectRejected({ path: "https://evil.example/v1/project" });
    expectRejected({ path: "//evil.example/v1/project" });
    expectRejected({ path: "/\\evil.example/v1/project" });
  });

  it("rejects plain and percent-encoded traversal", () => {
    expectRejected({ path: "/v1/../admin/users" });
    expectRejected({ path: "/v1/%2e%2e/admin/users" });
    expectRejected({ path: "/v1/keys/..%2f..%2fadmin/x" });
  });

  it("rejects params containing decoded slashes or control chars", () => {
    expectRejected({ path: "/v1/keys/common/%2Fetc%2Fpasswd" });
    expectRejected({ path: "/v1/keys/common/%00" });
  });
});

// --- project binding ----------------------------------------------------------

describe("proxy contract — project binding", () => {
  it("rejects exports for a different project id", () => {
    expectRejected({ path: "/v1/projects/999/export?locales=en&namespaces=common" });
  });

  it("rejects exports when the session has no project id", () => {
    expectRejected(
      { path: "/v1/projects/42/export?locales=en&namespaces=common" },
      { ...CTX, projectId: undefined },
    );
  });

  it("matches string project ids too", () => {
    expectOk(
      { path: "/v1/projects/abc/export?locales=en&namespaces=common" },
      { ...CTX, projectId: "abc" },
    );
  });
});

// --- query validation ----------------------------------------------------------

describe("proxy contract — query validation", () => {
  it("rejects unknown query parameters", () => {
    expectRejected({ path: "/v1/project?debug=1" });
    expectRejected({ path: "/v1/translations?locales=en&admin=true" });
  });

  it("rejects duplicate query keys", () => {
    expectRejected({ path: "/v1/translations?locales=en&locales=de" });
  });

  it("rejects malformed locale/namespace values", () => {
    expectRejected({ path: "/v1/translations?locales=en/../../x" });
    expectRejected({ path: "/v1/translations?namespaces=" });
    expectRejected({ path: `/v1/translations?locales=${"a".repeat(100)}` });
    expectRejected({ path: `/v1/translations?namespaces=${Array(60).fill("ns").join(",")}` });
  });
});

// --- body validation -----------------------------------------------------------

describe("proxy contract — body validation", () => {
  it("rejects bodies on routes without one", () => {
    expectRejected({ path: "/v1/project", body: "{}" });
  });

  it("requires a body where the contract has one", () => {
    expectRejected({ path: "/v1/keys", method: "PUT" });
  });

  it("rejects non-JSON and non-string bodies", () => {
    expectRejected({ path: "/v1/keys", method: "PUT", body: "{oops" });
    expectRejected({ path: "/v1/keys", method: "PUT", body: { key: "x" } });
  });

  it("rejects unexpected body fields", () => {
    const body = JSON.stringify({
      key: "a",
      namespace: "b",
      isPlural: false,
      translations: {},
      role: "admin",
    });
    expectRejected({ path: "/v1/keys", method: "PUT", body });
  });

  it.each([
    ["an empty key", { key: "", namespace: "b", isPlural: false, translations: {} }],
    ["a non-boolean isPlural", { key: "a", namespace: "b", isPlural: "no", translations: {} }],
    ["translations as an array", { key: "a", namespace: "b", isPlural: false, translations: [] }],
    [
      "a non-string translation value",
      {
        key: "a",
        namespace: "b",
        isPlural: false,
        translations: { en: { value: 42, status: "s" } },
      },
    ],
    [
      "an oversized translation value",
      {
        key: "a",
        namespace: "b",
        isPlural: false,
        translations: { en: { value: "x".repeat(30_000), status: "s" } },
      },
    ],
    [
      "an unknown translation status",
      {
        key: "a",
        namespace: "b",
        isPlural: false,
        translations: { en: { value: "x", status: "draft" } },
      },
    ],
    [
      "an extra field inside a translation",
      {
        key: "a",
        namespace: "b",
        isPlural: false,
        translations: { en: { value: "x", status: "not_reviewed", privileged: true } },
      },
    ],
  ])("rejects a save payload with %s", (_label, bad) => {
    expectRejected({ path: "/v1/keys", method: "PUT", body: JSON.stringify(bad) });
  });

  it("rejects extra fields in handshake key references", () => {
    const body = JSON.stringify({
      keys: [{ namespace: "common", key: "hero.title", keyId: 123 }],
    });
    expectRejected({ path: "/v1/context/handshake", method: "POST", body }, TELEMETRY_CTX);
  });

  it.each(
    (() => {
      const observation = validObservation();
      return [
        ["a client-controlled observationHash", { ...observation, observationHash: "spoofed" }],
        ["an extra uiType field", { ...observation, uiType: "text" }],
        ["an extra translationRole field", { ...observation, translationRole: "content" }],
        [
          "rawText inside semantic",
          { ...observation, semantic: { ...observation.semantic, rawText: "secret" } },
        ],
        [
          "an undefined ariaRole",
          { ...observation, semantic: { ...observation.semantic, ariaRole: undefined } },
        ],
        [
          "a title on a semantic ancestry entry",
          {
            ...observation,
            semantic: {
              ...observation.semantic,
              ancestry: [{ ...observation.semantic.ancestry[0], title: "rendered text" }],
            },
          },
        ],
        [
          "an extra debug flag in constraints",
          { ...observation, constraints: { ...observation.constraints, debug: true } },
        ],
        [
          "textContent on a neighbor",
          { ...observation, neighbors: [{ ...observation.neighbors[0], textContent: "secret" }] },
        ],
        [
          "a negative neighbor distance",
          { ...observation, neighbors: [{ ...observation.neighbors[0], distance: -1 }] },
        ],
        [
          "a raw flag inside the spatial rect",
          {
            ...observation,
            spatial: {
              rect: { x: 1, y: 2, w: 3, h: 4, raw: true },
              centerPoint: { x: 1, y: 2 },
              readingOrderIndex: 0,
            },
          },
        ],
      ] as const;
    })(),
  )("rejects an observation with %s", (_label, item) => {
    const body = JSON.stringify({ ...validUsagesBody(), items: [item] });
    expectRejected({ path: "/v1/context/usages", method: "POST", body }, TELEMETRY_CTX);
  });

  it.each([
    ["a string hashFnVersion", { hashFnVersion: "1" }],
    ["a fractional hashFnVersion", { hashFnVersion: 1.5 }],
    ["an extra env field", { env: "production" }],
    [
      "a profileHash on a still-valid ping",
      {
        stillValid: [
          {
            namespace: "common",
            key: "cta",
            screenGroup: "/",
            observationHash: "abc",
            profileHash: "not-allowed",
          },
        ],
      },
    ],
  ])("rejects a usages envelope with %s", (_label, override) => {
    const body = JSON.stringify({ ...validUsagesBody(), ...override });
    expectRejected({ path: "/v1/context/usages", method: "POST", body }, TELEMETRY_CTX);
  });

  it("measures the body limit in UTF-8 bytes, not JS string length", () => {
    // ~350k emoji -> ~700k UTF-16 code units (under 1M) but ~1.4MB UTF-8.
    const value = "😀".repeat(350_000);
    const body = JSON.stringify({
      key: "a",
      namespace: "b",
      isPlural: false,
      translations: { en: { value, status: "s" } },
    });
    expect(body.length).toBeLessThan(1_000_000);
    expectRejected({ path: "/v1/keys", method: "PUT", body });
  });

  it("rejects deeply nested bodies", () => {
    let nested: unknown = "x";
    for (let i = 0; i < 30; i++) nested = { n: nested };
    const body = JSON.stringify({
      origin: TELEMETRY_CTX.origin,
      hashFnVersion: 1,
      items: [{ ...validObservation(), deep: nested }],
      stillValid: [],
    });
    expectRejected({ path: "/v1/context/usages", method: "POST", body }, TELEMETRY_CTX);
  });
});

// --- telemetry gating -----------------------------------------------------------

describe("proxy contract — telemetry gating", () => {
  const handshakeBody = JSON.stringify({ keys: [] });
  const usagesBody = (origin: string) =>
    JSON.stringify({ origin, hashFnVersion: 1, items: [], stillValid: [] });

  it("blocks context routes when collectContext is off", () => {
    expectRejected({ path: "/v1/context/handshake", method: "POST", body: handshakeBody }, CTX);
    expectRejected(
      { path: "/v1/context/usages", method: "POST", body: usagesBody(CTX.origin) },
      CTX,
    );
  });

  it("rejects usages reported for a different origin", () => {
    expectRejected(
      { path: "/v1/context/usages", method: "POST", body: usagesBody("https://other.example") },
      TELEMETRY_CTX,
    );
  });

  it("rejects oversized telemetry batches", () => {
    const keys = Array(150).fill({ namespace: "a", key: "b" });
    expectRejected(
      { path: "/v1/context/handshake", method: "POST", body: JSON.stringify({ keys }) },
      TELEMETRY_CTX,
    );
  });
});

// --- envelope validation ---------------------------------------------------------

describe("proxy contract — request envelope", () => {
  it("rejects a request with no id at all", () => {
    expect(validateProxyRequest({ path: "/v1/project" }, BASE, CTX).ok).toBe(false);
  });

  it.each([
    ["an empty string", ""],
    ["a 200-character string", "x".repeat(200)],
    ["a number", 42],
  ])("rejects an id that is %s", (_label, id) => {
    expectRejected({ id });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "str"],
    ["a number", 42],
    ["an array", []],
  ])("rejects a payload that is %s", (_label, payload) => {
    expect(validateProxyRequest(payload, BASE, CTX).ok).toBe(false);
  });

  it("rejects oversized paths", () => {
    expectRejected({ path: "/v1/" + "x".repeat(3000) });
  });

  it("defaults a missing method to GET", () => {
    const result = validateProxyRequest({ id: "x", path: "/v1/project" }, BASE, CTX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.method).toBe("GET");
  });

  it("only coerces keepalive === true", () => {
    expect(expectOk({ keepalive: true }).keepalive).toBe(true);
    expect(expectOk({ keepalive: "yes" }).keepalive).toBe(false);
  });
});
