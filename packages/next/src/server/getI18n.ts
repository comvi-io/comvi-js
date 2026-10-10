import { createBoundTranslation, translationResultToString } from "@comvi/core";
import type { TranslationParams, TranslationResult } from "@comvi/core";
import { getConfiguredRouting, resolveServerI18n } from "./cache";
import { ensureInitialized } from "./ensureInitialized";
import { getLocale } from "./getLocale";
import type { ServerTranslatingInstance } from "./instanceTypes";
import { loadChain } from "./loadMessages";
import type {
  GetI18nOptions,
  RequestView,
  ServerI18n,
  TranslationFunction,
  HasTranslationOptions,
} from "./types";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** Explicit locales already reported as missing from `routing.locales`. */
const warnedLocales = new Set<string>();

/**
 * An explicit locale the config's `routing` does not list renders anyway (the
 * catalog falls back); `notFound()` stays the app's job. Development says so
 * once per locale. Without a `routing` export nothing is validated.
 */
const warnUnknownLocale = (locale: string): void => {
  const locales = getConfiguredRouting()?.locales;
  if (!locales || locales.includes(locale) || warnedLocales.has(locale)) return;
  warnedLocales.add(locale);
  console.warn(
    `[@comvi/next] getI18n({ locale: "${locale}" }): "${locale}" is not in routing.locales (${locales.join(", ")}). Call notFound() for an unknown locale before rendering.`,
  );
};

/**
 * Get i18n for use in Server Components, Server Actions, and Route Handlers.
 *
 * Uses the server i18n instance (the `withComvi({ config })` module, or the one
 * registered with setI18n) and the locale you pass: `getI18n({ locale })`.
 * Without one it reads the request context (set by setRequestLocale or
 * middleware).
 *
 * @param options - Options object with `locale` and `ns`
 * @returns `{ t, hasTranslation, locale }` — the same shape `@comvi/nuxt`'s
 * `useTranslation` returns
 *
 * @example
 * ```tsx
 * // Server Component - using keys from default namespace
 * import { getI18n } from '@comvi/next/server';
 *
 * export default async function HomePage() {
 *   const { t } = await getI18n();
 *   return (
 *     <div>
 *       <h1>{t('home.title')}</h1>
 *       <p>{t('common.description')}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Using a different namespace
 * const { t } = await getI18n();
 * // Access admin namespace translations
 * t('title', { ns: 'admin' })        // → "Admin Dashboard"
 * t('roles.admin', { ns: 'admin' })  // → "Administrator"
 * ```
 *
 * @remarks
 * getI18n auto-loads one namespace, the default one or the one passed via
 * getI18n({ ns }), for the request locale and every locale of the instance's
 * `fallbackLocale` chain. If you call t() with a different ns, ensure you
 * preloaded it via loadMessages(locale, { namespaces: [...] }) in your layout
 * or metadata.
 */
export async function getI18n(options?: GetI18nOptions): Promise<ServerI18n> {
  const i18n = resolveServerI18n();

  // The request view (`RequestView`) is resolved FIRST, before anything global
  // runs: `init()` loads the default namespace at the instance's own, static locale
  // (`_nsAddActiveNamespaces`), so a request that cannot say which locale it is
  // must not be what triggers it.
  let locale: RequestView["locale"] | undefined = options?.locale;
  if (locale) {
    if (IS_DEV) warnUnknownLocale(locale);
  } else {
    try {
      locale = await getLocale();
    } catch (e) {
      const err = new Error(
        "[@comvi/next] Locale not set. " +
          "Call setRequestLocale(locale) in your layout/page first, or configure middleware.",
      );
      (err as Error & { cause?: unknown }).cause = e;
      throw err;
    }
  }

  await ensureInitialized(i18n);

  const defaultNs: RequestView["defaultNs"] = options?.ns ?? i18n.getDefaultNamespace();

  // A page can render before its layout completes, so the namespace may not be
  // in yet — for the request locale or for any locale of its fallback chain. A
  // cached primary catalog says nothing about the fallbacks, so each is checked.
  await loadChain(i18n, [...new Set([locale, ...i18n.getFallbackLocales()])], [defaultNs]);

  // The one place allowed to reach the instance's translator: the shared instance
  // contributes catalog and loader only, and `ServerI18nInstance` has no `t`/`tRaw`
  // so no other server helper can translate. Every call below names the request
  // locale explicitly.
  const translate = createBoundTranslation(i18n as ServerTranslatingInstance, defaultNs) as (
    key: string,
    params?: TranslationParams,
  ) => TranslationResult;

  // The locale travels in params, so concurrent renders cannot race on it.
  const t = ((key: string, params?: TranslationParams) => {
    const result = translate(key, {
      ...params,
      locale,
    });
    return translationResultToString(result);
  }) as TranslationFunction;

  const hasTranslation = (key: string, opts?: HasTranslationOptions) => {
    const checkLocale = opts?.locale ?? locale;
    const checkNs = opts?.ns ?? defaultNs;
    return i18n.hasTranslation(key, checkLocale, checkNs);
  };

  // `locale` is the same binding `t` and `hasTranslation` close over, not a
  // second read: a result whose `locale` could disagree with its own `t` would
  // be worse than no `locale` at all.
  return { t, hasTranslation, locale };
}
