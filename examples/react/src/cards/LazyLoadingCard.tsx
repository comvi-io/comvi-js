import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";
import { NamespacesLine } from "../components/NamespacesLine";

export function LazyLoadingCard() {
  // `useI18n()` re-renders this card when a catalog lands, so the list grows
  // as you switch languages.
  const { t, getLoadedLocales } = useI18n();

  return (
    <FeatureCard feature="lazy">
      <div className="net">
        <code data-testid="fetched">
          {t("loader.fetched", { locales: getLoadedLocales().join(", ") })}
        </code>
        <NamespacesLine />
      </div>
    </FeatureCard>
  );
}
