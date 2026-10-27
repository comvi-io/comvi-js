import { useI18n } from "@comvi/react";
import { useFormat } from "@comvi/react/format";
import { FeatureCard } from "../components/FeatureCard";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function FormattingCard() {
  const { t } = useI18n();
  // Formatters in the language on screen: they change with it.
  const format = useFormat();

  return (
    <FeatureCard feature="formatting">
      <p className="widget">
        {t("stats.summary", {
          views: format.number(1234567),
          date: format.date(RELEASED, { dateStyle: "long", timeZone: "UTC" }),
        })}
      </p>
      <p className="widget">
        {t("demo.formatting.price", { price: format.currency(1234.5, "EUR") })}
      </p>
    </FeatureCard>
  );
}
