import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

export function LazyCard() {
  const { t, cacheRevision, getLoadedLocales, getActiveNamespaces } = useI18n();

  // Both getters are plain calls; reading `cacheRevision()` re-runs these when
  // a catalog lands.
  const fetched = () => {
    void cacheRevision();
    return t("loader.fetched", { locales: getLoadedLocales().join(", ") });
  };
  const namespaces = () => {
    void cacheRevision();
    return t("demo.lazy.namespaces", { namespaces: getActiveNamespaces().join(", ") });
  };

  return (
    <Card title={t("demo.lazy.title")} body={t("demo.lazy.body")}>
      <p class="network">
        <span data-testid="fetched">{fetched()}</span>
        <span>{namespaces()}</span>
      </p>
    </Card>
  );
}
