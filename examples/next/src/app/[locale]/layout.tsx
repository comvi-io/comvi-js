import { notFound } from "next/navigation";
import { getTextDirection } from "@comvi/core";
import { hasLocale } from "@comvi/next/routing";
import { ComviProvider } from "@comvi/next/server";
import { routing } from "@/i18n/routing";
import { css } from "./styles";

/** Prerender /en, /uk and /de at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // A `[locale]` segment outside `routing.locales` is a bad URL, not a request
  // for the fallback language.
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // No `useI18n()` here: a Server Component has no hooks, so `dir` comes from
    // core's free function, which answers the same question from the locale
    // alone.
    <html lang={locale} dir={getTextDirection(locale)}>
      <body>
        {/* Inlined so the example stays a handful of files: a real app imports
            a stylesheet, which is a build concern rather than an i18n one. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {/* Loads this locale's catalogs (and the fallback chain) on the
            server and seeds the client host from `src/i18n/config.ts` with
            them, so the client components below render the right language on
            the first paint. Only the locale and the plain catalog cross to
            the client, never the host. */}
        <ComviProvider locale={locale}>{children}</ComviProvider>
      </body>
    </html>
  );
}
