import type { H3Event } from "h3";
import { useRuntimeConfig } from "#imports";
import type { NuxtI18nRuntimeConfig, NuxtI18nPrivateRuntimeConfig } from "../../../types";
import { DEFAULT_COOKIE_NAME } from "../../defaults";
import { normalizeLocaleCookie, normalizeLocaleDetection } from "../../_vendor/locale-routing";

/** The Nuxt RuntimeConfig subset Comvi needs. */
export interface ComviServerRuntimeConfig {
  public: {
    comvi: NuxtI18nRuntimeConfig["comvi"];
    [key: string]: unknown;
  };
  comvi: NuxtI18nPrivateRuntimeConfig["comvi"];
  [key: string]: unknown;
}

/** Last-resort fallback so callers never receive undefined. */
const EMPTY_CONFIG: ComviServerRuntimeConfig = {
  public: {
    comvi: {
      locales: [],
      localeObjects: {},
      defaultLocale: "en",
      localePrefix: "as-needed",
      defaultNs: "default",
      fallbackLocale: "en",
      localeCookie: normalizeLocaleCookie(undefined, DEFAULT_COOKIE_NAME),
      localeDetection: normalizeLocaleDetection(undefined),
    },
  },
  comvi: {},
};

/**
 * The runtime config of this request: Nitro's own `useRuntimeConfig(event)`,
 * which is the only place a Nitro route can read it from. Nitro puts nothing on
 * `event.context` until that function is called for the event, so reading the
 * context alone answered a `server/api` route with the empty fallback below:
 * no locales, and every request resolved to `en`.
 */
export function getServerRuntimeConfig(event?: H3Event): ComviServerRuntimeConfig {
  // A config handed over on the event wins: a caller outside Nitro has no other way.
  if (event?.context?.runtimeConfig) {
    return event.context.runtimeConfig as ComviServerRuntimeConfig;
  }

  const nitroRuntime = useRuntimeConfig(event) as Partial<ComviServerRuntimeConfig> | undefined;
  if (nitroRuntime?.public?.comvi) {
    return nitroRuntime as ComviServerRuntimeConfig;
  }

  try {
    const globalNuxt = (globalThis as Record<string, unknown>).__NUXT_CONFIG__ as
      ComviServerRuntimeConfig | undefined;
    if (globalNuxt) return globalNuxt;
  } catch {
    // Ignore
  }

  return EMPTY_CONFIG;
}
