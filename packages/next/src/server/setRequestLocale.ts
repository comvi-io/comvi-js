import { setRequestLocaleInternal } from "./cache";

/**
 * Enable static rendering for internationalized pages
 *
 * Call this at the top of your layout and page components before
 * using any translation functions. This is required for static
 * rendering with generateStaticParams().
 *
 * @param locale - The locale for this request (typically from params.locale)
 *
 * @example
 * ```tsx
 * // app/[locale]/page.tsx
 * import { getI18n, setRequestLocale } from '@comvi/next/server';
 *
 * export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
 *   const { locale } = await params;
 *   setRequestLocale(locale);
 *
 *   // Only now: getI18n() reads the locale this call cached.
 *   const { t } = await getI18n();
 *   return <h1>{t('title')}</h1>;
 * }
 * ```
 */
export function setRequestLocale(locale: string): void {
  setRequestLocaleInternal(locale);
}
