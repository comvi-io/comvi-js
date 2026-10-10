import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` is hoisted above the module body, so the two factories have to be
// hoisted with it to stay a single source of truth for the `vi.doMock` pair.
const { reactCacheMock, nextHeadersMock } = vi.hoisted(() => ({
  // React's cache() doesn't persist state outside Server Component render
  // context. Mock it with a simple memoization so the request-store pairing
  // actually works.
  reactCacheMock: () => ({
    cache: (fn: () => unknown) => {
      let cached: unknown;
      return () => {
        if (cached === undefined) cached = fn();
        return cached;
      };
    },
  }),
  nextHeadersMock: () => ({
    headers: vi.fn().mockResolvedValue(new Headers()),
  }),
}));

// The static `vi.mock` pair resolves the top-level `import type` specifiers;
// the `vi.doMock` pair below re-registers them after `vi.resetModules()`.
vi.mock("react", reactCacheMock);
vi.mock("next/headers", nextHeadersMock);

let setRequestLocale: typeof import("../src/server/setRequestLocale").setRequestLocale;
let getLocale: typeof import("../src/server/getLocale").getLocale;

beforeEach(async () => {
  // Re-import each test so a fresh request store is created
  vi.resetModules();

  vi.doMock("react", reactCacheMock);
  vi.doMock("next/headers", nextHeadersMock);

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
