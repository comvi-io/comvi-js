"use client";

import type { ReactNode } from "react";
import { T, useI18n } from "@comvi/next/client";
import { Card } from "./Card";

/** The card's own sentence quotes the `<link>` tag, so it shows the tag as code. */
function TagQuote({ children }: { children?: ReactNode }) {
  return (
    <code>
      {"<link>"}
      {children}
      {"</link>"}
    </code>
  );
}

export function TagsCard() {
  const { t } = useI18n();
  return (
    <Card
      title={t("demo.tags.title")}
      body={<T i18nKey="demo.tags.body" components={{ link: <TagQuote /> }} />}
    >
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
