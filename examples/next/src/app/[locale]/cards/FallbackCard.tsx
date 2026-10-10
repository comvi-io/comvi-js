"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

export function FallbackCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.fallback.title")} body={t("demo.fallback.body")}>
      {/* Ukrainian has no `fallback.only_en`, so it renders the English text. */}
      <p className="widget" data-testid="fallback">
        {t("fallback.only_en")}
      </p>
      {/* No catalog has this key, so it renders as itself. */}
      <p className="widget">
        <code data-testid="missing-key">{t("fallback.nowhere")}</code>
      </p>
    </Card>
  );
}
