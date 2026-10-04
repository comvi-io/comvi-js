import { resolveLocaleOptions } from "../../src/locale-options";
import type { DetectBrowserLanguageOptions, NuxtI18nRuntimeConfig } from "../../src/types";

type RuntimeLocaleKeys = Pick<NuxtI18nRuntimeConfig["comvi"], "localeCookie" | "localeDetection">;

/**
 * The runtime keys the module writes for a 0.4 `detectBrowserLanguage` value,
 * through the module's own resolver: a case written against the old spelling
 * keeps testing what an app with that spelling gets.
 */
export function fromDetectBrowserLanguage(
  value: DetectBrowserLanguageOptions | false,
): RuntimeLocaleKeys {
  const { localeCookie, localeDetection } = resolveLocaleOptions({ detectBrowserLanguage: value });
  return { localeCookie, localeDetection };
}

/** A runtime-config override with its `detectBrowserLanguage` key resolved the same way. */
export function resolveDetectOverride<T extends Record<string, unknown>>(
  overrides: T & { detectBrowserLanguage?: DetectBrowserLanguageOptions | false },
): Omit<T, "detectBrowserLanguage"> & Partial<RuntimeLocaleKeys> {
  const { detectBrowserLanguage, ...rest } = overrides;
  return detectBrowserLanguage === undefined
    ? rest
    : { ...rest, ...fromDetectBrowserLanguage(detectBrowserLanguage) };
}
