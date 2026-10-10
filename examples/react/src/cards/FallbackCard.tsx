import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

export function FallbackCard() {
  const { t } = useI18n();

  return (
    <FeatureCard feature="fallback">
      {/* Missing from uk.json: Ukrainian shows the English sentence. */}
      <p className="widget" data-testid="fallback">
        {t("fallback.only_en")}
      </p>
      {/* In no catalog at all: the key itself shows. */}
      <p className="widget">
        <code data-testid="missing-key">{t("fallback.nowhere")}</code>
      </p>
    </FeatureCard>
  );
}
