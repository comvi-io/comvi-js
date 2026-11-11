import { getI18n } from "@/i18n/server";
import { I18nProvider } from "@comvi/next/server";
import { WithBrowserOptions } from "@/i18n/client";
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
  // A `[locale]` outside `routing.locales` is a 404, before any instance exists.
  // This request's instance has the default namespace for the locale and its fallback.
  const { i18n, dir } = await getI18n({ locale });

  return (
    // `rtl` for Arabic.
    <html lang={locale} dir={dir}>
      <body>
        {/* Hands this request's catalogs to the client components as data, so they
            render translated on the first paint and the browser fetches nothing. */}
        <I18nProvider i18n={i18n} routing={routing} client={WithBrowserOptions}>
          <NameProvider>{children}</NameProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
