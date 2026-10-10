import { useState } from "react";
import { useI18n } from "@comvi/react";
import { ChoiceChips } from "../components/ChoiceChips";
import { FeatureCard } from "../components/FeatureCard";

const genders = ["female", "male", "other"] as const;

export function SelectCard() {
  const { t } = useI18n();
  const [gender, setGender] = useState<(typeof genders)[number]>("female");

  return (
    <FeatureCard feature="select">
      <ChoiceChips
        values={genders}
        value={gender}
        label={(value) => t(`demo.select.${value}`)}
        onChange={setGender}
      />
      <p className="widget" data-testid="select-message">
        {t("demo.select.message", { gender })}
      </p>
    </FeatureCard>
  );
}
