import { describe, it, expect, vi, beforeEach } from "vitest";

const { headersMock, getRequestLocaleFromCacheMock, getConfiguredRoutingMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getRequestLocaleFromCacheMock: vi.fn(),
  getConfiguredRoutingMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("../src/server/cache", () => ({
  getRequestLocaleFromCache: getRequestLocaleFromCacheMock,
  getConfiguredRouting: getConfiguredRoutingMock,
}));

import { getLocale } from "../src/server/getLocale";

describe("getLocale", () => {
  beforeEach(() => {
    headersMock.mockReset();
    getRequestLocaleFromCacheMock.mockReset();
    getConfiguredRoutingMock.mockReset();
    getConfiguredRoutingMock.mockReturnValue(undefined);
  });

  it("returns locale from request cache first", async () => {
    getRequestLocaleFromCacheMock.mockReturnValue("de");

    await expect(getLocale()).resolves.toBe("de");
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("falls back to middleware locale header", async () => {
    getRequestLocaleFromCacheMock.mockReturnValue(undefined);
    headersMock.mockResolvedValue(new Headers([["x-comvi-locale", "fr"]]));

    await expect(getLocale()).resolves.toBe("fr");
  });

  it("throws when locale cannot be resolved", async () => {
    getRequestLocaleFromCacheMock.mockReturnValue(undefined);
    headersMock.mockResolvedValue(new Headers());

    await expect(getLocale()).rejects.toThrow(
      "[@comvi/next] Unable to determine locale. " +
        "Make sure to call setRequestLocale() in your layout/page or configure middleware.",
    );
  });

  it("throws when the middleware locale header is present but empty", async () => {
    getRequestLocaleFromCacheMock.mockReturnValue(undefined);
    headersMock.mockResolvedValue(new Headers([["x-comvi-locale", ""]]));

    await expect(getLocale()).rejects.toThrow("Unable to determine locale");
  });

  // The header is client-controlled on any path the middleware matcher skips
  // (or in an app with no middleware): it is validated before it becomes the
  // lookup locale a loader builds a URL from.
  describe("x-comvi-locale validation", () => {
    beforeEach(() => {
      getRequestLocaleFromCacheMock.mockReturnValue(undefined);
    });

    it("ignores a header that is not a locale code when there is no routing", async () => {
      headersMock.mockResolvedValue(new Headers([["x-comvi-locale", "../evil"]]));

      await expect(getLocale()).rejects.toThrow("Unable to determine locale");
    });

    it("accepts a well-formed locale code when there is no routing", async () => {
      headersMock.mockResolvedValue(new Headers([["x-comvi-locale", "pt-BR"]]));

      await expect(getLocale()).resolves.toBe("pt-BR");
    });

    it("ignores a locale outside routing.locales and falls back to the default", async () => {
      getConfiguredRoutingMock.mockReturnValue({ locales: ["en", "uk"], defaultLocale: "en" });
      headersMock.mockResolvedValue(new Headers([["x-comvi-locale", "zz"]]));

      await expect(getLocale()).resolves.toBe("en");
    });

    it("ignores a path-like header under routing too", async () => {
      getConfiguredRoutingMock.mockReturnValue({ locales: ["en", "uk"], defaultLocale: "en" });
      headersMock.mockResolvedValue(new Headers([["x-comvi-locale", "../evil"]]));

      await expect(getLocale()).resolves.toBe("en");
    });

    it("honours a header listed in routing.locales", async () => {
      getConfiguredRoutingMock.mockReturnValue({ locales: ["en", "uk"], defaultLocale: "en" });
      headersMock.mockResolvedValue(new Headers([["x-comvi-locale", "uk"]]));

      await expect(getLocale()).resolves.toBe("uk");
    });
  });
});
