"use client";

import { useI18n } from "@comvi/react";
import { useFormat } from "@comvi/react/format";
import { Card } from "./Card";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function FormattingCard() {
  const { t } = useI18n();
  // Formatters in the language on screen, in the server's time zone (the payload's).
  const format = useFormat();
  return (
    <Card title={t("demo.formatting.title")} body={t("demo.formatting.body")}>
      <p className="widget">
        {t("stats.summary", {
          views: format.number(1234567),
          date: format.date(RELEASED, { dateStyle: "long" }),
        })}
      </p>
      <p className="widget">
        {t("demo.formatting.price", { price: format.currency(1234.5, "EUR") })}
      </p>
    </Card>
  );
}
