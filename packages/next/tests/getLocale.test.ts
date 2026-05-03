import { describe, it, expect, vi, beforeEach } from "vitest";

const { headersMock, getRequestLocaleFromCacheMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getRequestLocaleFromCacheMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("../src/server/cache", () => ({
  getRequestLocaleFromCache: getRequestLocaleFromCacheMock,
}));

import { getLocale } from "../src/server/getLocale";

describe("getLocale", () => {
  beforeEach(() => {
    headersMock.mockReset();
    getRequestLocaleFromCacheMock.mockReset();
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

    await expect(getLocale()).rejects.toThrow("Unable to determine locale");
  });
});
