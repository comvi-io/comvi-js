import { useSyncExternalStore } from "react";
import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";
import { NamespacesLine } from "../components/NamespacesLine";
import { fetched } from "../i18n";

export function LazyLoadingCard() {
  const { t } = useI18n();
  // The list grows as you switch languages: each one is fetched the first time.
  const { locales } = useSyncExternalStore(fetched.subscribe, fetched.get);

  return (
    <FeatureCard feature="lazy">
      <div className="net">
        <code data-testid="fetched">{t("loader.fetched", { locales: locales.join(", ") })}</code>
        <NamespacesLine />
      </div>
    </FeatureCard>
  );
}
