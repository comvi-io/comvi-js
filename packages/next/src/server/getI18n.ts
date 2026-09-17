import { createBoundTranslation, translationResultToString } from "@comvi/core";
import type { TranslationParams, TranslationResult } from "@comvi/core";
import { getI18nInstance } from "./cache";
import { ensureInitialized } from "./ensureInitialized";
import { getLocale } from "./getLocale";
import type { ServerTranslatingHost } from "./hostTypes";
import { loadTranslations } from "./loadTranslations";
import type {
  GetI18nOptions,
  RequestView,
  ServerI18n,
  TranslationFunction,
  HasTranslationOptions,
} from "./types";

/**
 * Get i18n for use in Server Components, Server Actions, and Route Handlers.
 *
 * Uses the global i18n instance (configured via setI18n) and reads the locale
 * from the request context (set by setRequestLocale or middleware).
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
 * getI18n auto-loads only the default namespace (or the namespace passed via
 * getI18n({ ns })). If you call t() with a different ns, ensure you preloaded it
 * via loadTranslations(locale, { namespaces: [...] }) in your layout or metadata.
 */
export async function getI18n(options?: GetI18nOptions): Promise<ServerI18n> {
  const i18n = getI18nInstance();

  // The request view (`RequestView`) is resolved FIRST, before anything global
  // runs: `init()` loads the default namespace at the host's own, static locale
  // (`_nsAddActiveNamespaces`), so a request that cannot say which locale it is
  // must not be what triggers it.
  let locale: RequestView["locale"] | undefined = options?.locale;
  if (!locale) {
    try {
      locale = await getLocale();
    } catch (e) {
      const err = new Error(
        "[comvi/next] Locale not set. " +
          "Call setRequestLocale(locale) in your layout/page first, or configure middleware.",
      );
      (err as Error & { cause?: unknown }).cause = e;
      throw err;
    }
  }

  await ensureInitialized(i18n);

  const defaultNs: RequestView["defaultNs"] = options?.ns ?? i18n.getDefaultNamespace();

  // A page can render before its layout completes, so the namespace may not be in yet.
  if (!i18n.hasLocale(locale, defaultNs)) {
    await loadTranslations(locale, { namespaces: [defaultNs] });
  }

  // The one place allowed to reach the host's translator: the shared host
  // contributes catalog and loader only, and `ServerI18nHost` has no `t`/`tRaw`
  // so no other server helper can translate. Every call below names the request
  // locale explicitly.
  const translate = createBoundTranslation(i18n as ServerTranslatingHost, defaultNs) as (
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
