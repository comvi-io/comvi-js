"use client";

import { useI18n } from "@comvi/react";
import { locales } from "@/i18n/routing";
import { Card } from "./Card";

/** Each language this page carries, its name read from that language's catalog with the `locale` call option. */
export function OptionsCard() {
  const { t, i18n } = useI18n();
  const held = locales.filter((code) => i18n.has("app.title", { locale: code, fallback: false }));
  return (
    <Card title={t("demo.options.title")} body={t("demo.options.body")}>
      <ul className="widget languages">
        {held.map((code) => (
          <li key={code} lang={code} dir="auto">
            {t("demo.options.inOwn", {
              name: t("demo.options.name", { locale: code }),
              locale: code,
            })}
          </li>
        ))}
      </ul>
    </Card>
  );
}
