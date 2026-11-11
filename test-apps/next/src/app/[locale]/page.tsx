import { formatDate, formatNumber } from "@comvi/core/format";
import { getI18n } from "@/i18n/server";
import { ClientCard } from "./ClientCard";
import { WHEN } from "./when";

import { routing } from "@/i18n/routing";

// Static: every locale is prerendered at build. The explicit locale reads no request API, so
// nothing here turns the page dynamic.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t, i18n } = await getI18n({ locale });
  return (
    <section data-testid="server">
      <h1 data-testid="server-title">{t("home.title")}</h1>
      <p data-testid="server-param">{t("home.intro", { name: "Ada" })}</p>
      <p data-testid="server-plural">{t("plurals.items", { count: 2 })}</p>
      <p data-testid="server-rich">
        {t("rich_text.nested_simple", {
          link: (c) => <a href="https://comvi.io/docs">{c}</a>,
          bold: (c) => <b>{c}</b>,
        })}
      </p>
      <p data-testid="server-number">{formatNumber(i18n, 1234.5)}</p>
      <p data-testid="server-date">
        {formatDate(i18n, WHEN, { dateStyle: "medium", timeStyle: "short" })}
      </p>
      <ClientCard />
    </section>
  );
}
