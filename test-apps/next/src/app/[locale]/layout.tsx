import type { ReactNode } from "react";
import { handover } from "@comvi/core/ssr";
import { getI18n } from "@/i18n/server";
import { Provider } from "@/i18n/client";
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
        <Provider payload={handover(i18n)} routing={routing}>
          <Navigation />
          <main>{children}</main>
        </Provider>
      </body>
    </html>
  );
}
