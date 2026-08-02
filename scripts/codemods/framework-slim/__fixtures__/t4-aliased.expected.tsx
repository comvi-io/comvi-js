// T4 — aliases ride along through T1 and T3.
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

export function Aliased() {
  const { reloadTranslations: reload } = useI18nLoader();
  return reload;
}

export function AliasedMixed() {
  const { t } = useI18n("ns");
  const { onLoadError: handleLoadError } = useI18nLoader();
  const { onMissingKey: handleMissingKey } = useI18nPlugins();
  return { t, handleLoadError, handleMissingKey };
}
