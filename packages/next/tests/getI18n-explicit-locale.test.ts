// @vitest-environment node
/**
 * `getI18n({ locale })`, the primary form in the docs.
 *
 * An explicit locale is used for that call and for nothing else: it neither
 * reads nor writes the request store, so a page needs no `setRequestLocale()`
 * before it, and two calls in one request with different locales (a page and
 * its `generateMetadata`, alternate-language links) stay independent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// React's `cache()` only scopes per request inside a Server Component render.
// Outside one, memoize once per module load, and reload the modules per test:
// one test is one request.
const { reactWithCache } = vi.hoisted(() => ({
  reactWithCache: async (importOriginal: () => Promise<Record<string, unknown>>) => ({
    ...(await importOriginal()),
    cache: (fn: () => unknown) => {
      let cached: unknown;
      return () => (cached ??= fn());
    },
  }),
}));
vi.mock("react", reactWithCache);
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

const CATALOGS: Record<string, Record<string, string>> = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
  de: { greeting: "Hallo" },
};

/** Fresh server modules and one registered host: one request. */
async function request() {
  vi.resetModules();
  const { createNextI18n } = await import("../src/createNextI18n");
  const server = await import("../src/server");
  const cache = await import("../src/server/cache");
  const { i18n } = createNextI18n({
    locales: ["en", "uk", "de"],
    defaultLocale: "en",
    defaultNs: "common",
    devMode: false,
  });
  const loader = vi.fn(async (locale: string) => CATALOGS[locale] ?? {});
  i18n.registerLoader(loader);
  server.setI18n(i18n);
  return { ...server, storedLocale: cache.getRequestLocaleFromCache, loader };
}

beforeEach(() => {
  vi.resetModules();
});

describe("getI18n({ locale })", () => {
  it("renders with no request locale set, and leaves the store empty", async () => {
    const { getI18n, getLocale, storedLocale } = await request();

    const { t, locale } = await getI18n({ locale: "uk" });

    expect(locale).toBe("uk");
    expect(t("greeting" as never)).toBe("Привіт");
    expect(storedLocale()).toBeUndefined();
    // Nothing else filled the store either: the no-arg form still has no locale.
    await expect(getLocale()).rejects.toThrow("[@comvi/next] Unable to determine locale");
  });

  it("wins over the request store and does not modify it", async () => {
    const { getI18n, setRequestLocale, storedLocale } = await request();
    setRequestLocale("en");

    const explicit = await getI18n({ locale: "de" });
    expect(explicit.t("greeting" as never)).toBe("Hallo");
    expect(storedLocale()).toBe("en");

    const fromStore = await getI18n();
    expect(fromStore.locale).toBe("en");
    expect(fromStore.t("greeting" as never)).toBe("Hello");
  });

  it("two calls in one request with different locales stay independent", async () => {
    const { getI18n, loader } = await request();

    const [uk, de] = await Promise.all([getI18n({ locale: "uk" }), getI18n({ locale: "de" })]);

    expect(uk.t("greeting" as never)).toBe("Привіт");
    expect(de.t("greeting" as never)).toBe("Hallo");
    expect(loader.mock.calls.map(([locale]) => locale)).toEqual(
      expect.arrayContaining(["uk", "de"]),
    );
  });
});
