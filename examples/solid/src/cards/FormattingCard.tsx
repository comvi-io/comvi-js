import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function FormattingCard() {
  const { t, formatNumber, formatDate } = useI18n();
  return (
    <Card title={t("demo.formatting.title")} body={t("demo.formatting.body")}>
      <p class="widget">
        {t("stats.summary", {
          views: formatNumber(1234567),
          date: formatDate(RELEASED, { dateStyle: "long", timeZone: "UTC" }),
        })}
      </p>
      <p class="widget">
        {t("demo.formatting.price", {
          price: formatNumber(1234.5, { style: "currency", currency: "EUR" }),
        })}
      </p>
    </Card>
  );
}
