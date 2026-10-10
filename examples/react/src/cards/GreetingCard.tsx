import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

export function GreetingCard({ name }: { name: string }) {
  const { t } = useI18n();

  return (
    <FeatureCard feature="interpolation">
      <p className="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
    </FeatureCard>
  );
}
