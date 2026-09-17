import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `getI18n()` returns the locale it resolved, so a Server Component does not
 * have to call `getLocale()` a second time to learn which locale the `t` it is
 * holding closes over. `@comvi/nuxt`'s `useTranslation` already returned it;
 * this is the half that made the two server helpers differ in shape. See
 * `docs/design/next-nuxt-parity.md`.
 */

const getLocale = vi.fn();

vi.mock("../src/server/getLocale", () => ({ getLocale }));

async function importGetI18n() {
  vi.resetModules();
  return (await import("../src/server/getI18n")).getI18n;
}

function createHostStub() {
  const host = {
    getDefaultNamespace: vi.fn(() => "common"),
    hasLocale: vi.fn(() => true),
    hasTranslation: vi.fn(() => true),
    // The parameters are declared so `mock.calls[0][1]` is typed: an untyped
    // `vi.fn()` records a zero-length tuple and indexing it is a tsc error.
    t: vi.fn((_key: string, _params?: { locale?: string }) => "translated-value"),
    tRaw: vi.fn((_key: string, _params?: { locale?: string }) => "translated-value"),
    init: vi.fn().mockResolvedValue(undefined),
  };
  return host;
}

async function setUpHost() {
  const host = createHostStub();
  const { setI18n } = await import("../src/server/cache");
  setI18n(host as never);
  return host;
}

describe("getI18n() result shape", () => {
  beforeEach(() => {
    getLocale.mockReset();
  });

  it("returns the locale it resolved from the request", async () => {
    getLocale.mockResolvedValue("de");
    const getI18n = await importGetI18n();
    await setUpHost();

    const result = await getI18n();

    expect(result.locale).toBe("de");
  });

  it("returns the explicit locale when the caller names one", async () => {
    getLocale.mockResolvedValue("de");
    const getI18n = await importGetI18n();
    await setUpHost();

    const result = await getI18n({ locale: "uk" });

    expect(result.locale).toBe("uk");
    // The request locale was never consulted, so it cannot disagree with `t`.
    expect(getLocale).not.toHaveBeenCalled();
  });

  it("returns the same locale that t() closes over", async () => {
    getLocale.mockResolvedValue("de");
    const getI18n = await importGetI18n();
    const host = await setUpHost();

    const { t, locale } = await getI18n();
    t("hello");

    const params = host.tRaw.mock.calls[0]?.[1] ?? host.t.mock.calls[0]?.[1];
    expect(params?.locale).toBe(locale);
  });

  it("carries the three members nuxt's useTranslation carries, and nothing more", async () => {
    getLocale.mockResolvedValue("en");
    const getI18n = await importGetI18n();
    await setUpHost();

    const result = await getI18n();

    expect(Object.keys(result).sort()).toEqual(["hasTranslation", "locale", "t"]);
  });
});
