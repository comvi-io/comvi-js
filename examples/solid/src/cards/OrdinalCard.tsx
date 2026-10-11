import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

export function OrdinalCard(props: { count: number }) {
  const { t } = useI18n();
  return (
    <Card title={t("demo.ordinal.title")} body={t("demo.ordinal.body")}>
      <p class="widget" data-testid="ordinal">
        {t("demo.ordinal.message", { n: props.count })}
      </p>
    </Card>
  );
}
