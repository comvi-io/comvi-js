"use client";

import { T, useI18n } from "@comvi/react";
import { useFormat } from "@comvi/react/format";
import { WHEN } from "./when";

export function ClientCard() {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div data-testid="client">
      <p data-testid="client-title">{t("home.title")}</p>
      <p data-testid="client-param">{t("home.intro", { name: "Ada" })}</p>
      <p data-testid="client-plural">{t("plurals.items", { count: 2 })}</p>
      <p data-testid="client-rich">
        <T
          i18nKey="rich_text.nested_simple"
          link={(c) => <a href="https://comvi.io/docs">{c}</a>}
          bold={(c) => <b>{c}</b>}
        />
      </p>
      <p data-testid="client-number">{f.number(1234.5)}</p>
      <p data-testid="client-date">{f.date(WHEN, { dateStyle: "medium", timeStyle: "short" })}</p>
      <p data-testid="client-relative">{f.relative(WHEN)}</p>
      <p data-testid="client-per-call">{t("nav.home", { locale: "en" })}</p>
    </div>
  );
}
