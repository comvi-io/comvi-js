import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { name } from "../name";

export function GreetingCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.interpolation.title")} body={t("demo.interpolation.body")}>
      <p class="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
    </Card>
  );
}
