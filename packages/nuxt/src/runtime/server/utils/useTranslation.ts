import type { H3Event } from "h3";
import { getCookie, getHeader, getQuery } from "h3";
import { createI18n, type I18n, type RichParts, type TFor } from "@comvi/core";
import { useRuntimeConfig } from "#imports";
import { config, options } from "#comvi/options";
import { resolveAcceptLanguage } from "#comvi/detection";
import type { NuxtI18nRuntimeConfig } from "../../../types";
import { detectLocale } from "../../utils/detect";
import { extractLocaleFromPath } from "../../utils/locale-path";
import { track } from "../../utils/instances";

export interface UseTranslationOptions<NS extends string = "default"> {
  /** The namespace of `t()`; default `default`. */
  ns?: NS;
  /** Overrides detection; must be one of `comvi.locales`. */
  locale?: string;
}

export interface UseTranslationResult<NS extends string = "default"> {
  /** `t()` of the namespace, in the request's locale. */
  t: TFor<NS, RichParts>;
  locale: string;
  dir: "ltr" | "rtl";
  /** The request's instance of that locale; ended with the request. */
  i18n: I18n;
}

const KEY = "__comviByLocale";

/**
 * Translation in a Nitro route (auto-imported in `server/`).
 *
 * Locale: the `locale` option, then a locale prefix on the request path, then
 * `localeDetection.order` (the query parameter, the cookie, a configured header,
 * Accept-Language), then `defaultLocale` — the page's resolver, except that a prefixless
 * path is not read as the default locale (an API route has no prefix to omit).
 *
 * One instance per (request, locale), from the same `comvi` config and the same
 * `comvi.i18n.ts` factory, called with this `event`: a second call in the request gets the
 * same instance. The request's end destroys it (the module's Nitro plugin); a load still
 * in flight is aborted then. A failed load is reported through `onError`, and `t()`
 * renders what the fallback chain has.
 *
 * @example
 * ```ts
 * // server/api/hello.get.ts
 * export default defineEventHandler(async (event) => {
 *   const { t, locale } = await useTranslation(event);
 *   return { message: t("api.hello"), locale };
 * });
 * ```
 */
export async function useTranslation<NS extends string = "default">(
  event: H3Event,
  { ns, locale }: UseTranslationOptions<NS> = {},
): Promise<UseTranslationResult<NS>> {
  const routing = (useRuntimeConfig(event) as { public: NuxtI18nRuntimeConfig }).public.comvi;
  const { locales, localeCookie } = routing;
  if (locale !== undefined && !locales.includes(locale)) {
    throw new RangeError(
      `[@comvi/nuxt] useTranslation: locale "${locale}" is not one of comvi.locales (${locales.join(", ")})`,
    );
  }
  const path = (event.path || "/").split("?")[0]!;
  const target =
    locale ??
    extractLocaleFromPath(path, locales) ??
    detectLocale(
      routing,
      {
        query: getQuery(event),
        cookie: localeCookie ? getCookie(event, localeCookie.name) : undefined,
        header: (name) => getHeader(event, name),
      },
      resolveAcceptLanguage,
    ).locale;

  const context = event.context as Record<string, Map<string, I18n> | undefined>;
  const byLocale = (context[KEY] ||= new Map());
  let i18n = byLocale.get(target);
  if (!i18n) {
    i18n = track(event, createI18n({ ...config, locale: target, ...options(event) }));
    byLocale.set(target, i18n);
  }
  const n = (ns || "default") as NS;
  // Reported through `onError`; `t()` renders the fallback chain's text or the key.
  await i18n.load(n).catch(() => {});
  return { t: i18n.ns(n), locale: i18n.locale, dir: i18n.dir, i18n };
}
