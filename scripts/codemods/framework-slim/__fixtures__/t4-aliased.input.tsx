// T4 — aliases ride along through T1 and T3.
import { useI18n } from "@comvi/react";

export function Aliased() {
  const { reloadTranslations: reload } = useI18n();
  return reload;
}

export function AliasedMixed() {
  const { t, onLoadError: handleLoadError, onMissingKey: handleMissingKey } = useI18n("ns");
  return { t, handleLoadError, handleMissingKey };
}
