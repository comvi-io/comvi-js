import { normalizeRoutingOptions } from "../../src/runtime/_vendor/locale-routing";
import type {
  LocaleCookieConfig,
  LocaleDetectionConfig,
  NuxtI18nRuntimeConfig,
} from "../../src/types";

type RuntimeLocaleKeys = Pick<NuxtI18nRuntimeConfig["comvi"], "localeCookie" | "localeDetection">;

/**
 * The runtime keys the module writes for these options, through the same
 * shared `normalizeRoutingOptions` the module calls: a case written against the
 * options tests what an app writing them in `nuxt.config` gets.
 */
export function runtimeLocaleKeys(
  settings: {
    localeCookie?: LocaleCookieConfig;
    localeDetection?: false | LocaleDetectionConfig;
  } = {},
): RuntimeLocaleKeys {
  const { localeCookie, localeDetection } = normalizeRoutingOptions(
    { locales: [], defaultLocale: "en", ...settings },
    { cookieNameDefault: "i18n_locale" },
  );
  if (!localeDetection) return { localeCookie, localeDetection: false };
  const { resolveAcceptLanguage: _function, ...json } = localeDetection;
  return { localeCookie, localeDetection: json };
}
