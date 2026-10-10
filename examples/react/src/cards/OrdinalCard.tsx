import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

export function OrdinalCard({ count }: { count: number }) {
  const { t } = useI18n();

  return (
    <FeatureCard feature="ordinal">
      <p className="widget" data-testid="ordinal">
        {t("demo.ordinal.message", { n: count })}
      </p>
    </FeatureCard>
  );
}
