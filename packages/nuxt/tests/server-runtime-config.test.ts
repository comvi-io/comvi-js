import { afterEach, describe, expect, it } from "vitest";
import { getServerRuntimeConfig } from "../src/runtime/server/utils/runtime-config";

describe("getServerRuntimeConfig", () => {
  afterEach(() => {
    delete (globalThis as any).__NUXT_CONFIG__;
  });

  it("prefers runtime config from event context", () => {
    const runtimeConfig = {
      public: { comvi: { defaultLocale: "en" } },
      comvi: { apiKey: "key" },
    };
    const result = getServerRuntimeConfig({
      context: { runtimeConfig },
    } as any);

    expect(result).toBe(runtimeConfig);
  });

  it("falls back to Nitro runtime config shape", () => {
    const runtimeConfig = { public: { comvi: { defaultLocale: "de" } } };
    const result = getServerRuntimeConfig({
      context: { nitro: { runtimeConfig } },
    } as any);

    expect(result).toBe(runtimeConfig);
  });

  it("uses global Nuxt config as a last known fallback", () => {
    const globalConfig = { public: { comvi: { defaultLocale: "uk" } } };
    (globalThis as any).__NUXT_CONFIG__ = globalConfig;

    const result = getServerRuntimeConfig(undefined);

    expect(result).toBe(globalConfig);
  });

  it("returns a populated fallback config when nothing is available", () => {
    const result = getServerRuntimeConfig(undefined);

    expect(result).toEqual({
      public: {
        comvi: {
          locales: [],
          localeObjects: {},
          defaultLocale: "en",
          localePrefix: "as-needed",
          cookieName: "i18n_locale",
          defaultNs: "default",
          fallbackLocale: "en",
          detectBrowserLanguage: {
            useCookie: true,
            cookieName: "i18n_locale",
            cookieMaxAge: 31536000,
            redirectOnFirstVisit: true,
          },
        },
      },
      comvi: {},
    });
  });

  it("returns the populated fallback when the event carries no context at all", () => {
    const result = getServerRuntimeConfig({} as any);

    expect(result.public.comvi.defaultLocale).toBe("en");
    expect(result.comvi).toEqual({});
  });

  it("returns the populated fallback when the event context carries no runtime config", () => {
    const result = getServerRuntimeConfig({ context: {} } as any);

    expect(result.public.comvi.defaultLocale).toBe("en");
    expect(result.public.comvi.locales).toEqual([]);
    expect(result.comvi).toEqual({});
  });
});
