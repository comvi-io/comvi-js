import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

export function MissingParamCard() {
  const { t } = useI18n();

  return (
    <FeatureCard feature="missing">
      <p className="widget" data-testid="missing-param">
        {t("greeting.hello", {})}
      </p>
    </FeatureCard>
  );
}
