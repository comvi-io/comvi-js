import { describe, expect, it } from "vitest";
import { getServerRuntimeConfig } from "../src/runtime/server/utils/runtime-config";

describe("getServerRuntimeConfig", () => {
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
    (globalThis as any).__NUXT_CONFIG__ = { public: { comvi: { defaultLocale: "uk" } } };

    const result = getServerRuntimeConfig(undefined);
    expect(result).toEqual({ public: { comvi: { defaultLocale: "uk" } } });

    delete (globalThis as any).__NUXT_CONFIG__;
  });

  it("returns a populated fallback config when nothing is available", () => {
    const result = getServerRuntimeConfig(undefined);
    expect(result.public.comvi.defaultLocale).toBe("en");
    expect(result.public.comvi.locales).toEqual([]);
    expect(result.comvi).toEqual({});
  });
});
