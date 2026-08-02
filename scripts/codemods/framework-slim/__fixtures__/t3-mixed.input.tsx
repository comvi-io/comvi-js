// T3 — mixed destructure splits; `ns` stays on useI18n, both hooks emitted.
import { useI18n, useI18nLoader } from "@comvi/react";

export function Panel() {
  const { t, locale, reloadTranslations, onMissingKey } = useI18n("panel");
  return { t, locale, reloadTranslations, onMissingKey };
}

export function MergesIntoExisting() {
  const { reloadTranslations } = useI18nLoader();
  const { t, addActiveNamespace } = useI18n();
  return { t, reloadTranslations, addActiveNamespace };
}
