import type { H3Event } from "h3";
import type { NuxtI18nRuntimeConfig, NuxtI18nPrivateRuntimeConfig } from "../../../types";
import { DEFAULT_DETECT_BROWSER_LANGUAGE } from "../../defaults";

/**
 * Shape returned by getServerRuntimeConfig.
 * Mirrors the Nuxt RuntimeConfig subset that Comvi needs.
 */
export interface ComviServerRuntimeConfig {
  public: {
    comvi: NuxtI18nRuntimeConfig["comvi"];
    [key: string]: unknown;
  };
  comvi: NuxtI18nPrivateRuntimeConfig["comvi"];
  [key: string]: unknown;
}

/**
 * Empty config used as a last-resort fallback so callers never receive undefined.
 */
const EMPTY_CONFIG: ComviServerRuntimeConfig = {
  public: {
    comvi: {
      locales: [],
      localeObjects: {},
      defaultLocale: "en",
      localePrefix: "as-needed",
      cookieName: DEFAULT_DETECT_BROWSER_LANGUAGE.cookieName,
      defaultNs: "default",
      fallbackLocale: "en",
      detectBrowserLanguage: { ...DEFAULT_DETECT_BROWSER_LANGUAGE },
    },
  },
  comvi: {},
};

/**
 * Get runtime config from H3 event context.
 *
 * Handles different Nitro versions and fallback patterns.
 */
export function getServerRuntimeConfig(event?: H3Event): ComviServerRuntimeConfig {
  // Try event.context.runtimeConfig (Nitro 2.x+)
  if (event?.context?.runtimeConfig) {
    return event.context.runtimeConfig as ComviServerRuntimeConfig;
  }

  // Fallback for older Nitro versions (event.context.nitro.runtimeConfig)
  const nitroCtx = event?.context as Record<string, unknown> | undefined;
  const nitroRuntime = (nitroCtx?.nitro as Record<string, unknown> | undefined)?.runtimeConfig;
  if (nitroRuntime) {
    return nitroRuntime as ComviServerRuntimeConfig;
  }

  // Last resort - try global config
  try {
    const globalNuxt = (globalThis as Record<string, unknown>).__NUXT_CONFIG__ as
      | ComviServerRuntimeConfig
      | undefined;
    if (globalNuxt) return globalNuxt;
  } catch {
    // Ignore
  }

  return EMPTY_CONFIG;
}
