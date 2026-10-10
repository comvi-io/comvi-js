import { useState } from "react";
import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

export function GreetingCard({ name: initialName }: { name: string }) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);

  return (
    <FeatureCard feature="interpolation">
      <label className="field">
        <span>{t("demo.interpolation.label")}</span>
        <input
          data-testid="name-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p className="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
    </FeatureCard>
  );
}
