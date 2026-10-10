import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

type Props = { name: string; onChange: (name: string) => void };

export function GreetingCard({ name, onChange }: Props) {
  const { t } = useI18n();

  return (
    <FeatureCard feature="interpolation">
      <label className="field">
        <span>{t("demo.interpolation.label")}</span>
        <input
          data-testid="name-input"
          value={name}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <p className="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
    </FeatureCard>
  );
}
