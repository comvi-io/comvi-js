import { afterEach, describe, expect, it } from "vitest";
import { getServerRuntimeConfig } from "../src/runtime/server/utils/runtime-config";
import { setNitroRuntimeConfig } from "./mocks/nitro-imports";

describe("getServerRuntimeConfig", () => {
  afterEach(() => {
    setNitroRuntimeConfig(undefined);
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

  // What a real Nitro route gets: Nitro puts no config on `event.context`
  // until its own `useRuntimeConfig(event)` is called for that event.
  it("an event with no config on its context → Nitro's useRuntimeConfig(event) answers", () => {
    const runtimeConfig = { public: { comvi: { defaultLocale: "de" } } };
    setNitroRuntimeConfig(runtimeConfig);

    const result = getServerRuntimeConfig({ context: {} } as any);

    expect(result).toBe(runtimeConfig);
  });

  it("a Nitro config without the module's keys → the populated fallback, not a config with no comvi block", () => {
    setNitroRuntimeConfig({ public: {} });

    const result = getServerRuntimeConfig({ context: {} } as any);

    expect(result.public.comvi.defaultLocale).toBe("en");
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
          defaultNs: "default",
          fallbackLocale: "en",
          localeCookie: { name: "i18n_locale", maxAge: 31536000, secure: true, sameSite: "lax" },
          localeDetection: { order: ["query", "cookie", "accept-language"] },
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
