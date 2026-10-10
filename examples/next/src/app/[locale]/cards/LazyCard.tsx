"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";
import { Namespaces } from "./Namespaces";

export function LazyCard() {
  const { t, locale, isLoading, getLoadedLocales } = useI18n();
  // Read after mount: on the server one instance serves every request, so what
  // it has loaded says nothing about this visitor.
  const [fetched, setFetched] = useState<string[]>([]);
  useEffect(() => {
    setFetched(getLoadedLocales());
  }, [locale, isLoading, getLoadedLocales]);
  return (
    <Card title={t("demo.lazy.title")} body={t("demo.lazy.body")}>
      <div className="network">
        <div data-testid="fetched">{t("loader.fetched", { locales: fetched.join(", ") })}</div>
        <Namespaces />
      </div>
    </Card>
  );
}
