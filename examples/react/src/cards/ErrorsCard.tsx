import { useSyncExternalStore } from "react";
import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";
import { missingKeyCount } from "../i18n";

export function ErrorsCard() {
  const { t } = useI18n();
  const count = useSyncExternalStore(missingKeyCount.subscribe, missingKeyCount.get);

  return (
    <FeatureCard feature="errors">
      <p className="widget" data-testid="missing-count">
        {t("demo.errors.count", { count })}
      </p>
    </FeatureCard>
  );
}
