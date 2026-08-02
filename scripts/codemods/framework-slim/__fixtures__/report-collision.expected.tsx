// Report-only — a local `useI18nLoader` binding already shadows the hook, so
// the file is reported and left byte-identical.
import { useI18n } from "@comvi/react";

function useI18nLoader() {
  return { reloadTranslations: () => {} };
}

export function Shadowed() {
  const { t, reloadTranslations } = useI18n();
  return { t, reloadTranslations, useI18nLoader };
}
