// A quoted static key names the same member as the bare one, so it migrates
// the same way — and the emitted text stays the user's own.
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

export function Quoted() {
  const { "reloadTranslations": reload } = useI18nLoader();
  return reload;
}

export function QuotedMixed() {
  const { t } = useI18n();
  const { "onMissingKey": onMissingKey } = useI18nPlugins();
  return { onMissingKey, t };
}
