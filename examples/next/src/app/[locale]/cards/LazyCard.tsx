"use client";

import { useI18n } from "@comvi/react";
import { locales } from "@/i18n/routing";
import { Card } from "./Card";
import { Namespaces } from "./Namespaces";

export function LazyCard() {
  const { t, i18n } = useI18n();
  // The browser fetches no catalog: the server hands over the ones this page
  // needs, the locale's and its fallback's. `has(…, { fallback: false })` asks
  // the instance which locales it holds.
  const held = locales.filter((code) => i18n.has("app.title", { locale: code, fallback: false }));
  return (
    <Card title={t("demo.lazy.title")} body={t("demo.lazy.body")}>
      <div className="network">
        <div data-testid="fetched">{t("loader.fetched", { locales: held.join(", ") })}</div>
        <Namespaces />
      </div>
    </Card>
  );
}
