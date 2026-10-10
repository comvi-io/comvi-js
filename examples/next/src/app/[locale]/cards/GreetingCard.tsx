"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";
import { useName } from "./useName";

export function GreetingCard() {
  const { t } = useI18n();
  // A parameter is rendered as text, never as markup: try `?name=<b>Grace</b>`.
  const name = useName();
  return (
    <Card title={t("demo.interpolation.title")} body={t("demo.interpolation.body")}>
      <p className="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
    </Card>
  );
}
