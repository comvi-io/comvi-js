import { useSyncExternalStore } from "react";
import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";
import { missingKeys } from "../i18n";

export function ErrorsCard() {
  const { t } = useI18n();
  const missing = useSyncExternalStore(missingKeys.subscribe, missingKeys.get);

  return (
    <FeatureCard feature="errors">
      <p className="widget" data-testid="missing-count">
        {t("demo.errors.count", { count: missing.size })}
      </p>
    </FeatureCard>
  );
}
