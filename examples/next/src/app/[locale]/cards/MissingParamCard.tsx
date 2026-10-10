"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

export function MissingParamCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.missing.title")} body={t("demo.missing.body")}>
      <p className="widget" data-testid="missing-param">
        {t("greeting.hello", {})}
      </p>
    </Card>
  );
}
