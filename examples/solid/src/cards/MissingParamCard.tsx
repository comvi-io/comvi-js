import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

export function MissingParamCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.missing.title")} body={t("demo.missing.body")}>
      <p class="widget" data-testid="missing-param">
        {t("greeting.hello", {})}
      </p>
    </Card>
  );
}
