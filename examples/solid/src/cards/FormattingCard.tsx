import { useI18n } from "@comvi/solid";
import { useFormat } from "@comvi/solid/format";
import { Card } from "../components/Card";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function FormattingCard() {
  const { t } = useI18n();
  // Formatters in the language on screen: they change with it.
  const format = useFormat();
  return (
    <Card title={t("demo.formatting.title")} body={t("demo.formatting.body")}>
      <p class="widget">
        {t("stats.summary", {
          views: format.number(1234567),
          date: format.date(RELEASED, { dateStyle: "long", timeZone: "UTC" }),
        })}
      </p>
      <p class="widget">{t("demo.formatting.price", { price: format.currency(1234.5, "EUR") })}</p>
    </Card>
  );
}
