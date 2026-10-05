// The manual setup has no `withComvi({ config })` module, so the routing the
// header is validated against is the one handed to `createNextI18nFromHost`.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));

vi.mock("next/headers", () => ({ headers: headersMock }));

import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { createNextI18nFromHost, getLocale } from "../src/server";
import { _resetServerI18n, getConfiguredRouting } from "../src/server/cache";

const host = () => attachLoader(createI18n({ locale: "en", exposeGlobal: false, devMode: false }));

const withHeader = (value: string) =>
  headersMock.mockResolvedValue(new Headers([["x-comvi-locale", value]]));

beforeEach(() => {
  _resetServerI18n();
  headersMock.mockReset();
});

describe("getLocale — routing from createNextI18nFromHost", () => {
  it("has no routing before the factory runs", () => {
    expect(getConfiguredRouting()).toBeUndefined();
  });

  it("ignores a well-formed header outside the factory's routing.locales", async () => {
    createNextI18nFromHost(host, { locales: ["en", "uk"], defaultLocale: "en" });
    withHeader("zz");

    await expect(getLocale()).resolves.toBe("en");
  });

  it("honours a header listed in the factory's routing.locales", async () => {
    createNextI18nFromHost(host, { locales: ["en", "uk"], defaultLocale: "en" });
    withHeader("uk");

    await expect(getLocale()).resolves.toBe("uk");
  });

  it("forgets the routing when the registration is reset", async () => {
    createNextI18nFromHost(host, { locales: ["en", "uk"], defaultLocale: "en" });
    _resetServerI18n();

    expect(getConfiguredRouting()).toBeUndefined();
  });
});
