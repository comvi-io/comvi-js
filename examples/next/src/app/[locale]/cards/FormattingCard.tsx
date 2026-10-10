"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function FormattingCard() {
  const { t, locale, formatNumber, formatDate } = useI18n();
  const price = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    1234.5,
  );
  return (
    <Card title={t("demo.formatting.title")} body={t("demo.formatting.body")}>
      <p className="widget">
        {t("stats.summary", {
          views: formatNumber(1234567),
          date: formatDate(RELEASED, { dateStyle: "long" }),
        })}
      </p>
      <p className="widget">{t("demo.formatting.price", { price })}</p>
    </Card>
  );
}
