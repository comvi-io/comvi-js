/**
 * The single request seam every editor service goes through. Direct mode adds
 * the bearer header here; transport mode must forward the path and nothing
 * that could carry a credential.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApiConfig, resetApiConfig, type ApiTransport } from "../src/config/api";
import { apiFetch, getBaseUrl } from "../src/services/apiClient";

const TRANSPORT_SCOPE = "transport-runtime";

describe("apiFetch() in direct mode", () => {
  beforeEach(() => {
    initApiConfig("secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}")),
    );
  });

  afterEach(() => {
    resetApiConfig();
  });

  it("requests the base URL plus the path with the JSON and bearer headers", async () => {
    await apiFetch(undefined, "/v1/keys", { method: "GET" });

    expect(fetch).toHaveBeenCalledWith("https://api.example.com/v1/keys", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
      },
      body: undefined,
      keepalive: undefined,
      signal: undefined,
    });
  });

  it("forwards method, body, keepalive and signal from the init", async () => {
    const controller = new AbortController();

    await apiFetch(undefined, "/v1/context/observations", {
      method: "POST",
      body: '{"a":1}',
      keepalive: true,
      signal: controller.signal,
    });

    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: '{"a":1}',
      keepalive: true,
      signal: controller.signal,
    });
  });

  it("merges extra headers over the defaults", async () => {
    await apiFetch(undefined, "/v1/keys", {
      method: "GET",
      headers: { "Content-Type": "text/plain", "X-Trace": "abc" },
    });

    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toEqual({
      "Content-Type": "text/plain",
      Authorization: "Bearer secret-key",
      "X-Trace": "abc",
    });
  });

  it("sends only the default headers when called without an init", async () => {
    await apiFetch(undefined, "/v1/keys");

    expect(fetch).toHaveBeenCalledWith("https://api.example.com/v1/keys", {
      method: undefined,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
      },
      body: undefined,
      keepalive: undefined,
      signal: undefined,
    });
  });
});

describe("apiFetch() in transport mode", () => {
  let transport: ApiTransport;

  beforeEach(() => {
    transport = vi.fn(async () => new Response("{}"));
    initApiConfig(undefined, TRANSPORT_SCOPE, { transport, baseUrl: "https://api.example.com" });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    resetApiConfig(TRANSPORT_SCOPE);
  });

  it("delegates the path to the transport instead of calling fetch", async () => {
    const controller = new AbortController();

    await apiFetch(TRANSPORT_SCOPE, "/v1/keys", {
      method: "PUT",
      body: '{"a":1}',
      keepalive: true,
      signal: controller.signal,
    });

    expect(transport).toHaveBeenCalledWith("/v1/keys", {
      method: "PUT",
      body: '{"a":1}',
      keepalive: true,
      signal: controller.signal,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes an init with no request options when called without one", async () => {
    await apiFetch(TRANSPORT_SCOPE, "/v1/keys");

    expect(transport).toHaveBeenCalledWith("/v1/keys", {
      method: undefined,
      body: undefined,
      keepalive: undefined,
      signal: undefined,
    });
  });
});

describe("getBaseUrl()", () => {
  afterEach(() => {
    resetApiConfig();
  });

  it("returns the base URL of the requested scope", () => {
    initApiConfig("key-a", "runtime-a");

    expect(getBaseUrl("runtime-a")).toBe("https://api.example.com");
  });

  it("returns the demo host when the scope runs without an API key", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    initApiConfig(undefined);

    expect(getBaseUrl()).toBe("https://demo.comvi.dev");
  });
});
