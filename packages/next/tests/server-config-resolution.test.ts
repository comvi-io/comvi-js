// @vitest-environment node
/**
 * Where the server helpers find the instance.
 *
 * Two sources: the once-cell (`setI18n` / `createNextI18nFromHost`, the manual
 * path) and the `i18n` export of the module `withComvi({ config })` aliases to
 * `@comvi/next/config`. The cell wins; the alias is read lazily, at call time.
 * Neither is a programming error whose message names every way out.
 *
 * The alias exists only in a bundled Next graph, so each test stands in for it
 * with `vi.doMock("@comvi/next/config")` and fresh modules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
};

/** Fresh modules with `@comvi/next/config` standing in for the aliased user module. */
async function load(config: Record<string, unknown>) {
  vi.resetModules();
  // Vitest's strict mock throws on an export the factory left out; a real
  // namespace reads it as `undefined`, which is what an absent key models.
  vi.doMock("@comvi/next/config", () => ({ i18n: undefined, routing: undefined, ...config }));
  const { createNextI18n } = await import("../src/createNextI18n");
  const cache = await import("../src/server/cache");
  const { getI18n } = await import("../src/server/getI18n");
  return { createNextI18n, ...cache, getI18n };
}

const host = async () => {
  vi.resetModules();
  const { createNextI18n } = await import("../src/createNextI18n");
  const result = createNextI18n({ locales: ["en", "uk"], defaultLocale: "en", devMode: false });
  result.i18n.registerLoader(async (locale: string) => CATALOGS[locale] ?? {});
  return result;
};

beforeEach(() => {
  vi.doUnmock("@comvi/next/config");
});

describe("resolveServerI18n", () => {
  it("alias only → the config module's i18n", async () => {
    const { i18n } = await host();
    const { resolveServerI18n } = await load({ i18n });
    expect(resolveServerI18n()).toBe(i18n);
  });

  it("cell only (the manual path) → the registered instance", async () => {
    const { i18n } = await host();
    const { resolveServerI18n, setI18n } = await load({});
    setI18n(i18n);
    expect(resolveServerI18n()).toBe(i18n);
  });

  it("cell and alias holding the same instance → that instance, no warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = await host();
    const { resolveServerI18n, setI18n } = await load({ i18n });
    setI18n(i18n);
    expect(resolveServerI18n()).toBe(i18n);
    expect(warn).not.toHaveBeenCalled();
  });

  it("cell and alias holding different instances → the cell wins, one development warning naming both", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n: aliased } = await host();
    const { i18n: registered } = await host();
    const { resolveServerI18n, setI18n } = await load({ i18n: aliased });
    setI18n(registered);

    expect(resolveServerI18n()).toBe(registered);
    expect(resolveServerI18n()).toBe(registered);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("setI18n()");
    expect(warn.mock.calls[0]![0]).toContain("withComvi");
  });

  it("neither → the not-configured error names withComvi, setI18n and createNextI18nFromHost", async () => {
    const { resolveServerI18n } = await load({});
    expect(() => resolveServerI18n()).toThrow(
      "[comvi/next] i18n not configured. Add withComvi({ config }) to next.config, " +
        "or call setI18n(i18n) / createNextI18nFromHost(host, routing).",
    );
  });

  it("reads the alias at call time, not at import time", async () => {
    const { i18n } = await host();
    const config: Record<string, unknown> = {};
    vi.resetModules();
    vi.doMock("@comvi/next/config", () => ({
      get i18n() {
        return config.i18n;
      },
      routing: undefined,
    }));
    const { resolveServerI18n } = await import("../src/server/cache");
    config.i18n = i18n;
    expect(resolveServerI18n()).toBe(i18n);
  });

  it("getI18n and loadTranslations render through the aliased instance", async () => {
    const { i18n } = await host();
    const { getI18n } = await load({ i18n });
    const { loadTranslations } = await import("../src/server/loadTranslations");
    const { t } = await getI18n({ locale: "uk" });
    expect(t("greeting" as never)).toBe("Привіт");
    expect(await loadTranslations("en")).toEqual({ "en:default": { greeting: "Hello" } });
  });
});

describe("getI18n({ locale }) with a locale the routing does not list", () => {
  it("warns once per locale in development, and still renders", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n, routing } = await host();
    const { getI18n } = await load({ i18n, routing });

    await getI18n({ locale: "xx" });
    await getI18n({ locale: "xx" });
    await getI18n({ locale: "yy" });
    const { t, locale } = await getI18n({ locale: "en" });

    expect(locale).toBe("en");
    expect(t("greeting" as never)).toBe("Hello");
    const unknown = warn.mock.calls.filter(([m]) =>
      String(m).includes("is not in routing.locales"),
    );
    expect(unknown.map(([m]) => m)).toEqual([
      '[comvi/next] getI18n({ locale: "xx" }): "xx" is not in routing.locales (en, uk). Call notFound() for an unknown locale before rendering.',
      '[comvi/next] getI18n({ locale: "yy" }): "yy" is not in routing.locales (en, uk). Call notFound() for an unknown locale before rendering.',
    ]);
  });

  it("does not validate without a routing export", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = await host();
    const { getI18n } = await load({ i18n });
    await getI18n({ locale: "xx" });
    expect(warn.mock.calls.filter(([m]) => String(m).includes("routing.locales"))).toEqual([]);
  });
});
