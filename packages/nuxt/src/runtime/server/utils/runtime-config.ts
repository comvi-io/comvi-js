import type { H3Event } from "h3";
import type { NuxtI18nRuntimeConfig, NuxtI18nPrivateRuntimeConfig } from "../../../types";
import { DEFAULT_DETECT_BROWSER_LANGUAGE } from "../../defaults";

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
      cookieName: DEFAULT_DETECT_BROWSER_LANGUAGE.cookieName,
      defaultNs: "default",
      fallbackLocale: "en",
      detectBrowserLanguage: { ...DEFAULT_DETECT_BROWSER_LANGUAGE },
    },
  },
  comvi: {},
};

/** Handles the differing Nitro versions' config locations. */
export function getServerRuntimeConfig(event?: H3Event): ComviServerRuntimeConfig {
  // Nitro 2.x+
  if (event?.context?.runtimeConfig) {
    return event.context.runtimeConfig as ComviServerRuntimeConfig;
  }

  // Older Nitro
  const nitroCtx = event?.context as Record<string, unknown> | undefined;
  const nitroRuntime = (nitroCtx?.nitro as Record<string, unknown> | undefined)?.runtimeConfig;
  if (nitroRuntime) {
    return nitroRuntime as ComviServerRuntimeConfig;
  }

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
