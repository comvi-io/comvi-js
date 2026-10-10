"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";
import { useName } from "../NameProvider";

export function GreetingCard() {
  const { t } = useI18n();
  // A parameter is rendered as text, never as markup: try `<b>Grace</b>`.
  const [name, setName] = useName();
  return (
    <Card title={t("demo.interpolation.title")} body={t("demo.interpolation.body")}>
      <label className="field-label">
        {t("demo.interpolation.label")}
        <input
          className="field"
          data-testid="name-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p className="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
    </Card>
  );
}
