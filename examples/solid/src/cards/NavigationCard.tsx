import { A } from "@solidjs/router";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

export function NavigationCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.navigation.title")} body={t("demo.navigation.body")}>
      <p class="widget">
        <A data-testid="nav-about" href="/about">
          {t("demo.navigation.cta")}
        </A>
      </p>
    </Card>
  );
}
