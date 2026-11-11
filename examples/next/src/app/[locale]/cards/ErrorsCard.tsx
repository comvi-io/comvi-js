"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@comvi/react";
import { missingKeys } from "@/i18n/client";
import { Card } from "./Card";

const NONE: ReadonlySet<string> = new Set();

export function ErrorsCard() {
  const { t } = useI18n();
  // This browser's misses; the server's render and the hydration show none.
  const missing = useSyncExternalStore(missingKeys.subscribe, missingKeys.get, () => NONE);
  return (
    <Card title={t("demo.errors.title")} body={t("demo.errors.body")}>
      <p className="widget" data-testid="missing-count">
        {t("demo.errors.count", { count: missing.size })}
      </p>
    </Card>
  );
}
