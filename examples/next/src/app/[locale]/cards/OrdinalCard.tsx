"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

export function OrdinalCard({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <Card title={t("demo.ordinal.title")} body={t("demo.ordinal.body")}>
      <p className="widget" data-testid="ordinal">
        {t("demo.ordinal.message", { n: count })}
      </p>
    </Card>
  );
}
