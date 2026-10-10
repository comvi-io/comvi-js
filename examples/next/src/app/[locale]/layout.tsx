import { notFound } from "next/navigation";
import { getTextDirection } from "@comvi/core";
import { hasLocale } from "@comvi/next/routing";
import { ComviProvider } from "@comvi/next/server";
import { routing } from "@/i18n/routing";
import { NameProvider } from "./NameProvider";
import "./styles.css";

/** Prerender one page per locale at build time. */
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
    // `rtl` for Arabic. A Server Component has no hooks, so `dir` comes from
    // core's free function.
    <html lang={locale} dir={getTextDirection(locale)}>
      <body>
        {/* Loads this locale's catalogs on the server and hands them to the
            client instance, so client components render translated on the
            first paint. */}
        <ComviProvider locale={locale}>
          <NameProvider>{children}</NameProvider>
        </ComviProvider>
      </body>
    </html>
  );
}
