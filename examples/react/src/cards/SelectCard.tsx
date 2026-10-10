import { useState } from "react";
import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

const genders = ["female", "male", "other"] as const;
type Gender = (typeof genders)[number];

export function SelectCard() {
  const { t } = useI18n();
  const [gender, setGender] = useState<Gender>("female");

  return (
    <FeatureCard feature="select">
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
    </FeatureCard>
  );
}
