/**
 * The editor's API configuration registry: one config per runtime scope,
 * a build-time base URL, and the demo/transport modes that decide whether a
 * key is kept in the page at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApiConfig,
  initApiConfig,
  isDemoMode,
  resetApiConfig,
  type ApiTransport,
} from "../src/config/api";

const NOT_INITIALIZED =
  "[InContextEditor] API configuration not initialized. Make sure the plugin is properly configured.";

const DEMO_NOTICE =
  "[InContextEditor] Running in demo mode - API key not configured. Changes cannot be saved.";

describe("initApiConfig()", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetApiConfig();
  });

  it("stores the API key, the build-time base URL and demoMode=false for a configured key", () => {
    initApiConfig("secret-key");

    expect(getApiConfig()).toEqual({
      apiKey: "secret-key",
      baseUrl: "https://api.example.com",
      demoMode: false,
    });
  });

  it("stores an empty key, the demo host and demoMode=true when no key is given", () => {
    initApiConfig(undefined);

    expect(getApiConfig()).toEqual({
      apiKey: "",
      baseUrl: "https://demo.comvi.dev",
      demoMode: true,
    });
  });

  it("announces demo mode on the console when no key is given", () => {
    initApiConfig(undefined);

    expect(console.info).toHaveBeenCalledWith(DEMO_NOTICE);
  });

  it("stays quiet when an API key is configured", () => {
    initApiConfig("secret-key");

    expect(console.info).not.toHaveBeenCalled();
  });

  it("strips a trailing slash from the build-time base URL", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://env.example.com/");

    initApiConfig("secret-key");

    expect(getApiConfig().baseUrl).toBe("https://env.example.com");
  });

  it("falls back to the public production API when no base URL was substituted", () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);

    initApiConfig("secret-key");

    expect(getApiConfig().baseUrl).toBe("https://api.comvi.io");
  });

  it("keeps no API key in the page and is not demo mode when a transport is given", () => {
    const transport: ApiTransport = vi.fn();

    initApiConfig("secret-key", "extension", { transport, baseUrl: "https://proxy.example.com/" });

    expect(getApiConfig("extension")).toEqual({
      apiKey: "",
      baseUrl: "https://proxy.example.com",
      demoMode: false,
      transport,
    });
  });

  it("uses the build-time base URL for a transport that supplies none", () => {
    const transport: ApiTransport = vi.fn();

    initApiConfig(undefined, "extension", { transport });

    expect(getApiConfig("extension").baseUrl).toBe("https://api.example.com");
  });

  it("keeps one config per scope, addressed by scope id", () => {
    initApiConfig("key-a", "runtime-a");
    initApiConfig("key-b", "runtime-b");

    expect(getApiConfig("runtime-a").apiKey).toBe("key-a");
    expect(getApiConfig("runtime-b").apiKey).toBe("key-b");
  });
});

describe("getApiConfig()", () => {
  afterEach(() => {
    resetApiConfig();
  });

  it("throws when the scope was never initialized", () => {
    expect(() => getApiConfig("never-initialized")).toThrow(NOT_INITIALIZED);
  });

  it("treats an explicit empty-string scope as separate from the default scope", () => {
    initApiConfig("secret-key");

    expect(() => getApiConfig("")).toThrow(NOT_INITIALIZED);
  });
});

describe("isDemoMode()", () => {
  afterEach(() => {
    resetApiConfig();
  });

  it("reports false for a scope that was never initialized", () => {
    expect(isDemoMode("never-initialized")).toBe(false);
  });

  it("reports true for a scope initialized without an API key", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    initApiConfig(undefined, "demo-runtime");

    expect(isDemoMode("demo-runtime")).toBe(true);
  });
});

describe("resetApiConfig()", () => {
  beforeEach(() => {
    initApiConfig("default-key");
    initApiConfig("scoped-key", "runtime-a");
  });

  afterEach(() => {
    resetApiConfig();
  });

  it("removes only the named scope", () => {
    resetApiConfig("runtime-a");

    expect(() => getApiConfig("runtime-a")).toThrow(NOT_INITIALIZED);
    expect(getApiConfig().apiKey).toBe("default-key");
  });

  it("removes every scope when called without one", () => {
    resetApiConfig();

    expect(() => getApiConfig("runtime-a")).toThrow(NOT_INITIALIZED);
    expect(() => getApiConfig()).toThrow(NOT_INITIALIZED);
  });
});
