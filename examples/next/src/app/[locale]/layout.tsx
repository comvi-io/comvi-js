import { notFound } from "next/navigation";
import { getTextDirection } from "@comvi/core";
import { hasLocale } from "@comvi/next/routing";
import { loadTranslations, routing, setRequestLocale } from "@/i18n/server";
import { ComviProvider } from "./ComviProvider";
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

  // Puts the locale in React's per-request cache, where `getI18n()` and
  // `getLocale()` read it; it is also what lets `generateStaticParams()` render
  // these pages statically.
  setRequestLocale(locale);

  // A SERIALIZABLE "locale:namespace" map — this is what crosses to the client,
  // never the host.
  const messages = await loadTranslations(locale);

  return (
    // No `useI18n()` here: a Server Component has no hooks, so `dir` comes from
    // core's free function, which answers the same question from the locale
    // alone.
    <html lang={locale} dir={getTextDirection(locale)}>
      <body>
        {/* Inlined so the example stays a handful of files: a real app imports
            a stylesheet, which is a build concern rather than an i18n one. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <ComviProvider locale={locale} messages={messages}>
          {children}
        </ComviProvider>
      </body>
    </html>
  );
}
