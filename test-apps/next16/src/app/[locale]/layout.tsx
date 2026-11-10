import type { ReactNode } from "react";
import { getI18n } from "@/i18n/server";
import { I18nProvider } from "@comvi/next/server";
import { WithLoader } from "@/i18n/client";
import { routing } from "@/i18n/routing";
import { Navigation } from "./Navigation";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // An unsupported locale is notFound() inside, before any instance exists.
  const { i18n, dir } = await getI18n({ locale });
  return (
    <html lang={locale} dir={dir}>
      <body>
        <I18nProvider i18n={i18n} routing={routing} client={WithLoader}>
          <Navigation />
          <main>{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
