import type { H3Event } from "h3";
import { getCookie, getHeader } from "h3";
import { hasLoaderApi } from "@comvi/core";
import type { TranslationParams } from "@comvi/core";
import type { NuxtServerHost } from "../../../types";
import { getServerRuntimeConfig } from "./runtime-config";
import { getRequestI18n } from "./request-i18n";
import { resolveAcceptLanguage } from "../../utils/resolve-locale";
import { DEFAULT_DETECT_BROWSER_LANGUAGE } from "../../defaults";

export interface UseTranslationOptions {
  /**
   * Namespace bound into `t()` when a call names none. Defaults to the
   * module's `defaultNs`.
   *
   * `ns` is the word the whole library uses — core's `t(key, { ns })`,
   * `hasTranslation`'s `{ ns }`, and `@comvi/next`'s `getI18n({ ns })` — so the
   * two server helpers no longer differ by vocabulary alone. See
   * `docs/design/next-nuxt-parity.md`.
   */
  ns?: string;

  /**
   * @deprecated Renamed in 0.5: use `ns`. Removed in 0.6.
   */
  namespace?: string;

  /** Overrides detection. */
  locale?: string;
}

/**
 * The both-options warning is once per process, not once per request: a server
 * helper is called on every request, and a call site that passes both passes
 * both every time.
 */
let warnedAboutBothNamespaceOptions = false;

/**
 * ONE signature, keyed through core's `AcceptedKey` / `ArgsFor` pair exactly as
 * every client binding is — see `AcceptedKey` for why the key union is spelled
 * out inline rather than named.
 */
export interface ServerTranslationFunction {
  <
    K extends
      | {
          [P in import("@comvi/core").AcceptedKey]: P;
        }[import("@comvi/core").AcceptedKey]
      | import("@comvi/core").NamespacedKeys<N>,
    N extends import("@comvi/core").Namespaces = never,
  >(
    key: K,
    ...params: import("@comvi/core").ArgsFor<K, undefined, {}, N>
  ): string;
}

export interface UseTranslationResult {
  t: ServerTranslationFunction;
  locale: string;
  hasTranslation: (key: string, opts?: { locale?: string; ns?: string }) => boolean;
}

/**
 * Server-side translation utility for API routes and server middleware.
 *
 * Locale precedence: the explicit `locale` option, then the cookie, then the
 * Accept-Language header, then `defaultLocale`.
 *
 * @example
 * ```typescript
 * // server/api/hello.ts
 * export default defineEventHandler(async (event) => {
 *   const { t, locale } = await useTranslation(event)
 *   return {
 *     message: t('api.hello'),
 *     locale
 *   }
 * })
 * ```
 *
 * @example
 * ```typescript
 * // With an explicit namespace
 * const { t } = await useTranslation(event, { ns: 'api' })
 * return { message: t('hello') }
 * ```
 */
export async function useTranslation(
  event: H3Event,
  options: UseTranslationOptions = {},
): Promise<UseTranslationResult> {
  const config = getServerRuntimeConfig(event);
  const publicConfig = config.public.comvi;

  const {
    locales = [],
    defaultLocale = "en",
    cookieName = DEFAULT_DETECT_BROWSER_LANGUAGE.cookieName,
    defaultNs = "default",
    detectBrowserLanguage,
  } = publicConfig;
  if (
    import.meta.dev &&
    !warnedAboutBothNamespaceOptions &&
    options.ns !== undefined &&
    options.namespace !== undefined
  ) {
    warnedAboutBothNamespaceOptions = true;
    console.warn(
      `[@comvi/nuxt] useTranslation() was passed both \`ns\` ("${options.ns}") and the ` +
        `deprecated \`namespace\` ("${options.namespace}"). \`ns\` wins. Drop \`namespace\`: ` +
        "it is removed in 0.6.",
    );
  }

  // `||`, not `??`: an empty string has always fallen back to `defaultNs`, and
  // the rename is not the place to change that.
  const namespace = options.ns || options.namespace || defaultNs;

  const detectConfig =
    detectBrowserLanguage === false
      ? false
      : {
          ...DEFAULT_DETECT_BROWSER_LANGUAGE,
          ...(typeof detectBrowserLanguage === "object" ? detectBrowserLanguage : {}),
        };
  const useCookieForDetection = detectConfig !== false && detectConfig.useCookie === true;
  const fallbackLocale =
    detectConfig && "fallbackLocale" in detectConfig && detectConfig.fallbackLocale
      ? detectConfig.fallbackLocale
      : defaultLocale;
  const resolvedFallbackLocale = locales.includes(fallbackLocale) ? fallbackLocale : defaultLocale;

  let locale = options.locale;

  if (!locale && useCookieForDetection) {
    const cookieLocale = getCookie(event, cookieName);
    if (cookieLocale && locales.includes(cookieLocale)) {
      locale = cookieLocale;
    }
  }

  if (!locale && detectConfig !== false) {
    const acceptLanguage = getHeader(event, "accept-language");
    if (acceptLanguage) {
      locale = resolveAcceptLanguage(acceptLanguage, locales);
    }
  }

  const resolvedLocale = locale || resolvedFallbackLocale;

  const i18n = await getRequestI18n(event, resolvedLocale);

  if (!i18n.hasLocale(resolvedLocale, namespace)) {
    await loadTranslationsForLocale(i18n, resolvedLocale, [namespace]);
  }

  const t: ServerTranslationFunction = ((key: string, params?: TranslationParams) => {
    // `as never` because the key is a RUNTIME string: once an app generates
    // types, core's key parameter is the union of its literals and a `string`
    // matches none of them. Same idiom as every wrapper's `<T>` — and the
    // reason `tsconfig.keys-closed.json` exists, since with the registry OPEN
    // this call is permissive and the mistake is invisible.
    const result = i18n.t(
      key as never,
      {
        ...params,
        locale: resolvedLocale,
        ns: params?.ns ?? namespace,
      } as never,
    );
    return typeof result === "string" ? result : String(result);
  }) as ServerTranslationFunction;

  const hasTranslation = (key: string, opts?: { locale?: string; ns?: string }) => {
    return i18n.hasTranslation(key, opts?.locale ?? resolvedLocale, opts?.ns ?? namespace);
  };

  return { t, locale: resolvedLocale, hasTranslation };
}

/**
 * The host may have no loader at all: the generated default `#build/comvi.host`
 * builds core's BASE host, and only a `hostModule` factory composes
 * `@comvi/core/loader` onto it. Without the capability there is nothing to load
 * — whatever `comvi.setup` put in the catalog is already there — so this
 * returns instead of calling a member the host does not have.
 */
async function loadTranslationsForLocale(
  i18n: NuxtServerHost,
  locale: string,
  namespaces: string[],
): Promise<void> {
  if (i18n.locale !== locale) {
    await i18n.setLocaleAsync(locale);
  }

  if (!hasLoaderApi(i18n)) {
    return;
  }

  for (const ns of namespaces) {
    try {
      await i18n.addActiveNamespace(ns);
    } catch (error) {
      console.warn(`[@comvi/nuxt] Failed to load ${locale}:${ns}:`, error);
    }
  }
}
