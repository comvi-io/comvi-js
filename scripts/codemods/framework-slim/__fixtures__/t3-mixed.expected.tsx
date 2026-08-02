// T3 — mixed destructure splits; `ns` stays on useI18n, both hooks emitted.
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

export function Panel() {
  const { t, locale } = useI18n("panel");
  const { reloadTranslations } = useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  return { t, locale, reloadTranslations, onMissingKey };
}

export function MergesIntoExisting() {
  const { reloadTranslations, addActiveNamespace } = useI18nLoader();
  const { t } = useI18n();
  return { t, reloadTranslations, addActiveNamespace };
}
