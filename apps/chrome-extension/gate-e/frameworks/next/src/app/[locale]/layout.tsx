import type { ReactNode } from "react";
import { I18nProvider } from "@comvi/next/server";
import { getI18n } from "../../i18n/server";
import { WithDevtools } from "../../i18n/client";
import { routing } from "../../i18n/routing";
import { Booted } from "./Strings";

export const dynamic = "force-dynamic";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { i18n, dir } = await getI18n({ locale });
  return (
    <html lang={locale} dir={dir}>
      <body>
        <I18nProvider i18n={i18n} routing={routing} client={WithDevtools}>
          <Booted />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
