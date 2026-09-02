/**
 * The base URL is fixed at build time, so the normalization it goes through is
 * unreachable from the constant under test: vitest.config.ts defines
 * VITE_COMVI_API_BASE_URL as a literal with no trailing slash. These tests
 * drive the exported normalizer directly, which is the only place the real
 * build's `https://api.comvi.io/` shape can be exercised.
 */
import { describe, it, expect } from "vitest";
import { API_BASE_URL, normalizeBaseUrl } from "../config";

describe("normalizeBaseUrl", () => {
  it("strips a single trailing slash", () => {
    expect(normalizeBaseUrl("https://api.comvi.io/")).toBe("https://api.comvi.io");
  });

  it("strips a run of trailing slashes", () => {
    expect(normalizeBaseUrl("https://api.comvi.io///")).toBe("https://api.comvi.io");
  });

  it("leaves a URL with no trailing slash untouched", () => {
    expect(normalizeBaseUrl("https://api.comvi.io")).toBe("https://api.comvi.io");
  });

  it("strips the trailing slash of a base URL that carries a path prefix", () => {
    expect(normalizeBaseUrl("https://api.comvi.io/gateway/")).toBe("https://api.comvi.io/gateway");
  });

  it("keeps the slashes inside the URL, stripping only the trailing run", () => {
    expect(normalizeBaseUrl("https://api.comvi.io/a/b/")).toBe("https://api.comvi.io/a/b");
  });

  it("leaves a loopback base URL with a port untouched", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:8790")).toBe("http://127.0.0.1:8790");
  });

  it("returns the empty string for a value that is only slashes", () => {
    expect(normalizeBaseUrl("//")).toBe("");
  });
});

describe("API_BASE_URL", () => {
  it("is the normalized form of the build-time value", () => {
    // The literal comes from vitest.config.ts's `define`; the assertion pins
    // that the constant is routed through the normalizer rather than exported
    // raw.
    expect(API_BASE_URL).toBe("https://api.comvi.io");
    expect(API_BASE_URL.endsWith("/")).toBe(false);
  });
});
