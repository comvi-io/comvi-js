import { useState } from "react";
import { useI18n } from "@comvi/react";
import { ChoiceChips } from "../components/ChoiceChips";
import { FeatureCard } from "../components/FeatureCard";

const registers = ["formal", "informal"] as const;

export function FormalityCard() {
  const { t } = useI18n();
  const [formality, setFormality] = useState<(typeof registers)[number]>("formal");

  return (
    <FeatureCard feature="formality">
      <ChoiceChips
        values={registers}
        value={formality}
        label={(value) => t(`demo.formality.${value}`)}
        onChange={setFormality}
      />
      <p className="widget" data-testid="formality-message">
        {t("demo.formality.message", { formality })}
      </p>
    </FeatureCard>
  );
}
