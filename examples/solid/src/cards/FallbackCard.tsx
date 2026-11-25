import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

export function FallbackCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.fallback.title")} body={t("demo.fallback.body")}>
      {/* The Ukrainian catalog lacks this key, so Ukrainian shows the English text. */}
      <p class="widget" data-testid="fallback">
        {t("fallback.only_en")}
      </p>
      {/* No catalog has this key: it renders as its name. */}
      <p class="widget">
        <code data-testid="missing-key">
          {/* @ts-expect-error: no catalog has this key, so the generated types reject it */}
          {t("fallback.nowhere")}
        </code>
      </p>
    </Card>
  );
}
