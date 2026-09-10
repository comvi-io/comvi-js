// A quoted static key names the same member as the bare one, so it migrates
// the same way — and the emitted text stays the user's own.
import { useI18n } from "@comvi/react";

export function Quoted() {
  const { "reloadTranslations": reload } = useI18n();
  return reload;
}

export function QuotedMixed() {
  const { "onMissingKey": onMissingKey, t } = useI18n();
  return { onMissingKey, t };
}
