"use client";

import { useState } from "react";
import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

const genders = ["female", "male", "other"] as const;

export function SelectCard() {
  const { t } = useI18n();
  const [gender, setGender] = useState<(typeof genders)[number]>("female");
  return (
    <Card title={t("demo.select.title")} body={t("demo.select.body")}>
      <div className="options">
        {genders.map((value) => (
          <button
            key={value}
            className="chip"
            aria-pressed={gender === value}
            onClick={() => setGender(value)}
          >
            {t(`demo.select.${value}`)}
          </button>
        ))}
      </div>
      <p className="widget" data-testid="select-message">
        {t("demo.select.message", { gender })}
      </p>
    </Card>
  );
}
