import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function FormattingCard() {
  const { t, locale, formatNumber, formatDate } = useI18n();
  const price = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    1234.5,
  );

  return (
    <FeatureCard feature="formatting">
      <p className="widget">
        {t("stats.summary", {
          views: formatNumber(1234567),
          date: formatDate(RELEASED, { dateStyle: "long", timeZone: "UTC" }),
        })}
      </p>
      <p className="widget">{t("demo.formatting.price", { price })}</p>
    </FeatureCard>
  );
}
