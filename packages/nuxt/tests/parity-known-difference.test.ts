import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/runtime/utils/runtime", () => ({
  isServer: vi.fn(() => false),
}));

import middleware from "../src/runtime/middleware/i18n.global";
import {
  resetMocks,
  setMockCookie,
  mockRuntimeConfig,
  getMockCookieWrites,
} from "./mocks/nuxt-app";
import { useCookie, useState } from "#app";

/**
 * The ONE behavioural difference between `@comvi/next` and `@comvi/nuxt` that
 * `docs/design/next-nuxt-parity.md` records rather than removes: a prefixless
 * non-root URL under `localePrefix: "as-needed"` reads as the default locale
 * here, so a stored preference does not redirect. next redirects to the cookie's
 * locale instead. `packages/next/tests/parity-known-difference.test.ts` pins
 * next's half.
 *
 * Both halves are pinned so the record cannot go stale silently. When the
 * shared option lands after RC, BOTH tests change together and the record's
 * plan paragraph is what says so.
 */
describe("known Next/Nuxt difference: prefixless path vs stored locale", () => {
  beforeEach(() => {
    resetMocks();
    mockRuntimeConfig.public.comvi.localePrefix = "as-needed";
  });

  it("serves the default locale for /about even though the cookie says de", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware({ params: {}, path: "/about", fullPath: "/about" });

    // No redirect: `/about` IS the `en` URL in as-needed mode.
    expect(result).toBeUndefined();
    expect(useState<string>("i18n-locale").value).toBe("en");
  });

  it("keeps the de cookie rather than overwriting it with the served locale", async () => {
    setMockCookie("i18n_locale", "de");

    await middleware({ params: {}, path: "/about", fullPath: "/about" });

    // The preference survives: the next visit to `/` still goes to `/de`.
    // Both halves matter — the value is still `de`, and `en` was never written,
    // so this cannot pass merely because nothing touched the cookie at all.
    expect(useCookie("i18n_locale").value).toBe("de");
    expect(getMockCookieWrites("i18n_locale")).not.toContain("en");
  });

  it("still honours the cookie on the root path, which has no implied default", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware({ params: {}, path: "/", fullPath: "/" });

    expect(result).toEqual({ path: "/de", redirectCode: 302 });
  });
});
