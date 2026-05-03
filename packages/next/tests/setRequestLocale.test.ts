import { describe, it, expect, vi, beforeEach } from "vitest";

// React's cache() doesn't persist state outside Server Component render context.
// Mock it with a simple memoization so the request-store pairing actually works.
vi.mock("react", () => ({
  cache: (fn: () => unknown) => {
    let cached: unknown;
    return () => {
      if (cached === undefined) cached = fn();
      return cached;
    };
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Dynamic imports to pick up the mocked react.cache
let setRequestLocale: typeof import("../src/server/setRequestLocale").setRequestLocale;
let getLocale: typeof import("../src/server/getLocale").getLocale;

beforeEach(async () => {
  // Re-import each test so a fresh request store is created
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock("react", () => ({
    cache: (fn: () => unknown) => {
      let cached: unknown;
      return () => {
        if (cached === undefined) cached = fn();
        return cached;
      };
    },
  }));
  vi.doMock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Headers()),
  }));

  const setReqMod = await import("../src/server/setRequestLocale");
  setRequestLocale = setReqMod.setRequestLocale;

  const getLocMod = await import("../src/server/getLocale");
  getLocale = getLocMod.getLocale;
});

describe("setRequestLocale", () => {
  it("makes locale available to subsequent getLocale() calls", async () => {
    setRequestLocale("uk");

    const locale = await getLocale();
    expect(locale).toBe("uk");
  });

  it("overwrites a previously set locale", async () => {
    setRequestLocale("fr");
    setRequestLocale("de");

    const locale = await getLocale();
    expect(locale).toBe("de");
  });
});
