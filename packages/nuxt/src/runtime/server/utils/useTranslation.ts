import type { H3Event } from "h3";
import { getCookie, getHeader } from "h3";
import { hasLoaderApi } from "@comvi/core";
import type { TranslationParams } from "@comvi/core";
import type { NuxtServerHost } from "../../../types";
import { getServerRuntimeConfig } from "./runtime-config";
import { getRequestI18n } from "./request-i18n";
import { loadCatalogs } from "../../utils/load-catalogs";
import { resolveAcceptLanguage } from "../../utils/resolve-locale";
import { extractLocaleFromPath } from "../../utils/locale-path";
import { resolveAcceptLanguage as customResolveAcceptLanguage } from "#build/comvi.detection";

export interface UseTranslationOptions {
  /**
   * Namespace bound into `t()` when a call names none. Defaults to the
   * module's `defaultNs`.
   *
   * `ns` is the word the whole library uses — core's `t(key, { ns })`,
   * `hasTranslation`'s `{ ns }`, and `@comvi/next`'s `getI18n({ ns })` — so the
   * two server helpers no longer differ by vocabulary alone. See
   * `docs/design/next-nuxt-parity.md`.
   *
   * An empty string counts as NOT GIVEN: `ns: ""` falls back to `defaultNs`.
   */
  ns?: string;

  /** Overrides detection. */
  locale?: string;
}

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
 * The name `@comvi/next` uses for the same result, `{ t, hasTranslation,
 * locale }`; type-only, 0 B. See `docs/design/next-nuxt-parity.md`.
 */
export type ServerI18n = UseTranslationResult;

/**
 * Server-side translation utility for API routes and server middleware.
 *
 * Locale precedence: the explicit `locale` option, then a locale prefix on the
 * request path, then `localeDetection.order` (the query parameter, the cookie,
 * a configured header, Accept-Language), then `defaultLocale` — the route
 * middleware's order. A prefixless path is NOT read as the default locale here,
 * as the middleware reads a page URL under `as-needed`: an API route has no
 * locale prefix to omit.
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
    defaultNs = "default",
    localeCookie: cookieConfig,
    localeDetection: detectConfig,
  } = publicConfig;
  // `||`, not `??`: an empty `ns` counts as not given, as in `@comvi/next`.
  const namespace = options.ns || defaultNs;

  const accept = (candidate: string | null | undefined): string | undefined =>
    candidate && locales.includes(candidate) ? candidate : undefined;

  // The URL first, as in the route middleware: a locale prefix on the path,
  // then the sources in order. `event.path` carries the query string.
  const url = new URL(event.path || "/", "http://localhost");
  let locale = options.locale || extractLocaleFromPath(url.pathname, locales);

  for (const source of detectConfig ? detectConfig.order : []) {
    if (locale) break;
    if (source === "query") {
      const queryParam = detectConfig ? detectConfig.queryParam : undefined;
      locale = queryParam ? accept(url.searchParams.get(queryParam)) : undefined;
    } else if (source === "cookie") {
      locale = cookieConfig ? accept(getCookie(event, cookieConfig.name)) : undefined;
    } else if (source === "header") {
      const headerName = detectConfig ? detectConfig.headerName : undefined;
      locale = headerName ? accept(getHeader(event, headerName)) : undefined;
    } else if (source === "accept-language") {
      const acceptLanguage = getHeader(event, "accept-language");
      locale = acceptLanguage
        ? (customResolveAcceptLanguage ?? resolveAcceptLanguage)(
            acceptLanguage,
            locales,
            defaultLocale,
          )
        : undefined;
    }
  }

  const resolvedLocale = locale || defaultLocale;

  const i18n = await getRequestI18n(event, resolvedLocale);

  // The fallback chain too, whether or not the primary catalog was cached:
  // otherwise a key present only in a fallback catalog renders as the raw key.
  // The host is already on `resolvedLocale`, which the chain load leaves to the
  // primary path, so the two run in parallel without touching the same pair.
  await Promise.all([
    i18n.hasLocale(resolvedLocale, namespace)
      ? undefined
      : loadMessagesForLocale(i18n, resolvedLocale, [namespace]),
    loadCatalogs(i18n, [namespace]),
  ]);

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
async function loadMessagesForLocale(
  i18n: NuxtServerHost,
  locale: string,
  namespaces: string[],
): Promise<void> {
  if (i18n.locale !== locale) {
    await i18n.setLocale(locale);
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
