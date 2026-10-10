import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { missingKeys } from "../i18n";

export function ErrorsCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.errors.title")} body={t("demo.errors.body")}>
      <p class="widget" data-testid="missing-count">
        {t("demo.errors.count", { count: missingKeys() })}
      </p>
    </Card>
  );
}
