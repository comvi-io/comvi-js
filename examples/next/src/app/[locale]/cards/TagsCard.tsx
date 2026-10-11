"use client";

import { T, useI18n } from "@comvi/next/client";
import { Card } from "./Card";

export function TagsCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.tags.title")} body={t("demo.tags.body")}>
      {/* The app decides what `<link>` becomes; the translator decides where it goes. */}
      <p className="widget" data-testid="read-more">
        <T
          i18nKey="docs.read_more"
          components={{ link: <a href="https://comvi.io/docs" target="_blank" rel="noreferrer" /> }}
        />
      </p>
    </Card>
  );
}
