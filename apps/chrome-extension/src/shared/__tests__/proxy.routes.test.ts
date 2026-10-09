/**
 * Proxy contract: which calls are allowed, the request envelope, path resolution, route/method rejection, project binding and query validation.
 */
import { describe, it, expect } from "vitest";
import { validateProxyRequest } from "../proxy";
import wireFixture from "../__fixtures__/wire-observation.fixture.json";
import {
  BASE,
  CTX,
  TELEMETRY_CTX,
  MAX_PATH_LENGTH,
  MAX_ID_LENGTH,
  MAX_PARAM_LENGTH,
  MAX_KEY_LENGTH,
  MAX_NAMESPACE_LENGTH,
  req,
  expectOk,
  expectRejected,
  savePayload,
  savePut,
  spatial,
  observationWithSpatial,
  usagesBody,
  usagesPost,
  handshakePost,
  itemsOf,
  translationsPathOfLength,
} from "./proxy.fixtures";

describe("proxy contract — allowed SDK calls", () => {
  it("accepts GET /v1/project (key validation, project info)", () => {
    expect(expectOk({ path: "/v1/project" }).url).toBe("https://api.comvi.io/v1/project");
  });

  it("accepts GET /api/v1/api/project (legacy deployments)", () => {
    expectOk({ path: "/api/v1/api/project" });
  });

  it("accepts GET /v1/project/locales (languageService)", () => {
    expectOk({ path: "/v1/project/locales" });
  });

  it("accepts GET /v1/translations without query (getAllTranslationKeys)", () => {
    expectOk({ path: "/v1/translations" });
  });

  it("accepts GET /v1/translations with locales/namespaces query (fetch-loader)", () => {
    expectOk({ path: "/v1/translations?locales=en&namespaces=common,checkout" });
  });

  it("accepts GET /v1/projects/:id/export bound to the session project", () => {
    expectOk({ path: "/v1/projects/42/export?locales=en&namespaces=common" });
  });

  it("accepts GET /api/v1/api/projects/:id/export (legacy export)", () => {
    expectOk({ path: "/api/v1/api/projects/42/export?locales=en&namespaces=common" });
  });

  it("accepts GET /v1/keys/:ns/:key with encoded params", () => {
    const result = expectOk({ path: `/v1/keys/common/${encodeURIComponent("hero.title")}` });
    expect(result.url).toContain("/v1/keys/common/hero.title");
  });

  it("accepts PUT /v1/keys with a valid save payload", () => {
    expectOk(savePut(savePayload()));
  });

  it("accepts DELETE /v1/keys/:ns/:key", () => {
    expectOk({ path: "/v1/keys/common/hero.title", method: "DELETE" });
  });

  it("accepts POST /v1/context/handshake when telemetry is enabled", () => {
    expectOk(handshakePost({ keys: [{ namespace: "common", key: "hero.title" }] }), TELEMETRY_CTX);
  });

  it("accepts POST /v1/context/usages when telemetry is enabled and origin matches", () => {
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

  // The longest manageable key path: three-byte characters encode to 9 each.
  const longestKeyPath = `/v1/keys/${encodeURIComponent("名".repeat(MAX_NAMESPACE_LENGTH))}/${encodeURIComponent("ア".repeat(MAX_KEY_LENGTH))}`;

  it("accepts the longest key path, which is exactly the path limit", () => {
    expect(longestKeyPath).toHaveLength(MAX_PATH_LENGTH);
    expectOk({ path: longestKeyPath });
  });

  it("rejects a path one character past the limit", () => {
    expectRejected({ path: `${longestKeyPath}x` }, "Missing or invalid path");
  });

  it("still accepts a long translations path", () => {
    expectOk({ path: translationsPathOfLength(2048) });
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

  // Matching used to drop empty segments while the fetch URL kept them, so
  // "/v1//project" reached the API as a path outside the exact contract.
  it.each([
    ["a static route", "/v1//project"],
    ["a static route with a leading repeat", "//v1/project?x"],
    ["a parameterised route", "/v1/projects/42//export"],
    ["a parameterised route with a repeat before the id", "/v1/projects//42/export"],
  ])("rejects a repeated separator in %s", (_label, path) => {
    const result = validateProxyRequest(req({ path }), BASE, CTX);
    expect(result).toMatchObject({ ok: false });
  });

  it.each(["/v1//project", "/v1/projects/42//export", "/v1/projects//42/export"])(
    "names the empty segment in %s",
    (path) => {
      expectRejected({ path }, "Empty path segment not allowed");
    },
  );

  it.each([
    ["/v1/../admin/users", "/admin/users"],
    ["/v1/%2e%2e/admin/users", "/admin/users"],
  ])("normalizes traversal in %s and then rejects the result", (path, normalized) => {
    expectRejected({ path }, `Not an allowed API call: GET ${normalized}`);
  });
});

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

  // Path parameters share the save body's key/namespace domain, so whatever
  // can be saved can be read back and deleted.
  it("accepts a key parameter of exactly the save body's key limit", () => {
    expectOk({ path: `/v1/keys/common/${"k".repeat(MAX_KEY_LENGTH)}` });
  });

  it("rejects a key parameter one character past the save body's key limit", () => {
    const key = "k".repeat(MAX_KEY_LENGTH + 1);
    expectRejected(
      { path: `/v1/keys/common/${key}` },
      `Not an allowed API call: GET /v1/keys/common/${key}`,
    );
  });

  it("accepts a namespace parameter of exactly the save body's namespace limit", () => {
    expectOk({ path: `/v1/keys/${"n".repeat(MAX_NAMESPACE_LENGTH)}/title` });
  });

  it("rejects a namespace parameter one character past the save body's namespace limit", () => {
    const namespace = "n".repeat(MAX_NAMESPACE_LENGTH + 1);
    expectRejected(
      { path: `/v1/keys/${namespace}/title` },
      `Not an allowed API call: GET /v1/keys/${namespace}/title`,
    );
  });

  it("keeps the generic parameter cap for other parameters", () => {
    const projectId = "1".repeat(MAX_PARAM_LENGTH + 1);
    expectRejected(
      { path: `/v1/projects/${projectId}/export` },
      `Not an allowed API call: GET /v1/projects/${projectId}/export`,
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

  // An inherited Object.prototype name must never be looked up as a validator:
  // toString/constructor were accepted and forwarded, __proto__/valueOf threw.
  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "rejects the inherited name %s without throwing",
    (name) => {
      const path = `/v1/translations?${encodeURIComponent(name)}=x`;
      let result: ReturnType<typeof validateProxyRequest> | undefined;
      expect(() => {
        result = validateProxyRequest(req({ path }), BASE, CTX);
      }).not.toThrow();
      expect(result).toEqual({ ok: false, error: `Unexpected query parameter: ${name}` });
    },
  );

  it("accepts a locale list at exactly its item cap and item length", () => {
    const locales = Array(20).fill("l".repeat(64)).join(",");
    expectOk({ path: `/v1/translations?locales=${locales}` });
  });

  it("accepts a namespace list at exactly its item cap", () => {
    const namespaces = Array(50).fill("ns").join(",");
    expectOk({ path: `/v1/translations?namespaces=${namespaces}` });
  });
});
