"use client";

import { useState } from "react";
import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

const formalities = ["formal", "informal"] as const;

export function FormalityCard() {
  const { t } = useI18n();
  const [formality, setFormality] = useState<(typeof formalities)[number]>("formal");
  return (
    <Card title={t("demo.formality.title")} body={t("demo.formality.body")}>
      <div className="options">
        {formalities.map((value) => (
          <button
            key={value}
            className="chip"
            aria-pressed={formality === value}
            onClick={() => setFormality(value)}
          >
            {t(`demo.formality.${value}`)}
          </button>
        ))}
      </div>
      <p className="widget" data-testid="formality-message">
        {t("demo.formality.message", { formality })}
      </p>
    </Card>
  );
}
