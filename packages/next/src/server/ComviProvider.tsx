import type { JSX, ReactNode } from "react";
import { ComviClientProvider } from "../client/ComviClientProvider";
import { getConfiguredI18n, setRequestLocaleInternal } from "./cache";
import { loadTranslations } from "./loadTranslations";

export interface ComviProviderProps {
  /** The locale this tree renders in, typically the `[locale]` param. */
  locale: string;
  /** Namespaces to ship to the client. Default: the host's default namespace. */
  namespaces?: string[];
  children: ReactNode;
}

/**
 * The provider for an App Router layout, with `withComvi({ config })` in
 * next.config. It loads the locale's catalogs (and every locale of the
 * fallback chain) on the server and hands them to the client host from your
 * config module, so Client Components render translated on the first paint.
 *
 * It also sets the request locale, so the no-argument `getI18n()` and
 * `getLocale()` work inside its tree.
 *
 * Without `withComvi` it throws: keep your own `"use client"` wrapper around
 * `<I18nProvider>` from `@comvi/next/client` instead (manual setup).
 *
 * @example
 * ```tsx
 * // app/[locale]/layout.tsx
 * import { ComviProvider } from "@comvi/next/server";
 *
 * export default async function LocaleLayout({ children, params }) {
 *   const { locale } = await params;
 *   return (
 *     <html lang={locale}>
 *       <body>
 *         <ComviProvider locale={locale}>{children}</ComviProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export async function ComviProvider({
  locale,
  namespaces,
  children,
}: ComviProviderProps): Promise<JSX.Element> {
  if (!getConfiguredI18n()) {
    throw new Error(
      "[comvi/next] <ComviProvider> needs withComvi({ config }) in next.config: " +
        "the client reads the i18n instance from that module. Add it, or keep your own " +
        '"use client" wrapper around <I18nProvider> from @comvi/next/client ' +
        "(the manual setup, also the one for a config whose loader needs server-only code).",
    );
  }
  setRequestLocaleInternal(locale);
  const messages = await loadTranslations(locale, { namespaces });
  return (
    <ComviClientProvider locale={locale} messages={messages}>
      {children}
    </ComviClientProvider>
  );
}
