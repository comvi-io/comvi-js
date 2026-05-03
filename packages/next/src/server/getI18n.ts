import { createBoundTranslation } from "@comvi/core";
import type { TranslationParams, TranslationResult, VirtualNode } from "@comvi/core";
import { getI18nInstance } from "./cache";
import { ensureInitialized } from "./ensureInitialized";
import { getLocale } from "./getLocale";
import { loadTranslations } from "./loadTranslations";
import type {
  GetI18nOptions,
  ServerI18n,
  TranslationFunction,
  HasTranslationOptions,
} from "./types";

const virtualNodeToText = (node: VirtualNode): string => {
  if (node.type === "text") {
    return node.text;
  }

  let text = "";
  for (const child of node.children) {
    if (typeof child === "string") {
      text += child;
      continue;
    }
    text += virtualNodeToText(child);
  }
  return text;
};

const translationResultToString = (result: TranslationResult): string => {
  if (typeof result === "string") {
    return result;
  }

  let text = "";
  for (const part of result) {
    text += typeof part === "string" ? part : virtualNodeToText(part);
  }
  return text;
};

/**
 * Get i18n for use in Server Components, Server Actions, and Route Handlers
 *
 * This function uses the global i18n instance (configured via setI18n) and
 * automatically reads the locale from the request context (set by setRequestLocale
 * or middleware).
 *
 * @param options - Options object with locale and namespace
 * @returns Object with t() function and hasTranslation() helper
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
 * @example
 * ```tsx
 * // With explicit locale (for generateMetadata)
 * export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
 *   const { locale } = await params;
 *   const { t } = await getI18n({ locale });
 *   return { title: t('common.title') };
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Check if translation exists (with namespace support)
 * const { t, hasTranslation } = await getI18n();
 * hasTranslation('common.title')              // true (default namespace)
 * hasTranslation('title', { ns: 'admin' })    // true (admin namespace)
 * ```
 *
 * @remarks
 * getI18n auto-loads only the default namespace (or the namespace passed via
 * getI18n({ ns })). If you call t() with a different ns, ensure you preloaded it
 * via loadTranslations(locale, { namespaces: [...] }) in your layout or metadata.
 */
export async function getI18n(options?: GetI18nOptions): Promise<ServerI18n> {
  const i18n = getI18nInstance();
  await ensureInitialized(i18n);

  // Get locale from options or request context
  let locale = options?.locale;
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

  const defaultNs = options?.ns ?? i18n.getDefaultNamespace();

  // Auto-load translations if not available
  // This ensures translations work even when page renders before layout completes
  if (!i18n.hasLocale(locale, defaultNs)) {
    await loadTranslations(locale, { namespaces: [defaultNs] });
  }

  const translate = createBoundTranslation(i18n, defaultNs) as (
    key: string,
    params?: TranslationParams,
  ) => TranslationResult;

  // Create translation function that passes locale in params for thread-safety
  const t = ((key: string, params?: TranslationParams) => {
    const result = translate(key, {
      ...params,
      locale,
    });
    return translationResultToString(result);
  }) as TranslationFunction;

  // Create hasTranslation helper
  const hasTranslation = (key: string, opts?: HasTranslationOptions) => {
    const checkLocale = opts?.locale ?? locale;
    const checkNs = opts?.ns ?? defaultNs;
    return i18n.hasTranslation(key, checkLocale, checkNs);
  };

  return { t, hasTranslation };
}
