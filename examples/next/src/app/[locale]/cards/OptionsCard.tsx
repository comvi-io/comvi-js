"use client";

import { useEffect, useState } from "react";
import { getTextDirection } from "@comvi/core";
import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

/** Each loaded language's name, read from that language's catalog with the `locale` call option. */
export function OptionsCard() {
  const { t, locale, isLoading, getLoadedLocales } = useI18n();
  // Only catalogs this browser already holds, read after mount like the lazy card.
  const [loaded, setLoaded] = useState<string[]>([]);
  useEffect(() => {
    setLoaded(getLoadedLocales());
  }, [locale, isLoading, getLoadedLocales]);
  return (
    <Card title={t("demo.options.title")} body={t("demo.options.body")}>
      <ul className="widget languages">
        {loaded.map((code) => (
          <li key={code} lang={code} dir={getTextDirection(code)}>
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
