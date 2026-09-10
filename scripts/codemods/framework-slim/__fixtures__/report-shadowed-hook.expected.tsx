// Report-only — `useI18n` is imported from a Comvi binding AND declared
// locally, so the destructures are left alone instead of being silently
// re-pointed at the module import.
import { useI18n } from "@comvi/react";

export function Injected(useI18n) {
  const { reloadTranslations } = useI18n();
  return reloadTranslations;
}

export function Caught() {
  try {
    return null;
  } catch (useI18n) {
    const { onMissingKey } = useI18n();
    return onMissingKey;
  }
}
