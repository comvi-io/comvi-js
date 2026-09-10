// A quoted static key names the same member as the bare one, so it migrates
// the same way — and the emitted text stays the user's own. Escapes count:
// a double-quoted key is a JSON string, so `"\u0072eloadTranslations"` IS
// `reloadTranslations` and reading it raw made it a silent miss.
import { useI18n } from "@comvi/react";

export function Quoted() {
  const { "reloadTranslations": reload } = useI18n();
  return reload;
}

export function QuotedMixed() {
  const { "onMissingKey": onMissingKey, t } = useI18n();
  return { onMissingKey, t };
}

export function LeadingEscape() {
  const { "\u0072eloadTranslations": reload, t } = useI18n();
  reload();
  return t("leading");
}

export function InnerEscape() {
  const { "reload\u0054ranslations": again, locale } = useI18n();
  again();
  return locale;
}
