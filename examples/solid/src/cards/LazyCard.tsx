import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { fetched } from "../i18n";

export function LazyCard() {
  const { t } = useI18n();

  return (
    <Card title={t("demo.lazy.title")} body={t("demo.lazy.body")}>
      <p class="network">
        {/* The list grows as you switch languages: each one is fetched the first time. */}
        <span data-testid="fetched">
          {t("loader.fetched", { locales: fetched().locales.join(", ") })}
        </span>
        <span>{t("demo.lazy.namespaces", { namespaces: fetched().namespaces.join(", ") })}</span>
      </p>
    </Card>
  );
}
