"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@comvi/next/client";
import { missedKeys } from "@/i18n/config";
import { Card } from "./Card";

export function ErrorsCard() {
  const { t, locale } = useI18n();
  // Read after mount: the server's instance collects misses from every request.
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(missedKeys.size);
  }, [locale]);
  return (
    <Card title={t("demo.errors.title")} body={t("demo.errors.body")}>
      <p className="widget" data-testid="missing-count">
        {t("demo.errors.count", { count })}
      </p>
    </Card>
  );
}
