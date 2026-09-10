// A quoted static key names the same member as the bare one, so it migrates
// the same way — and the emitted text stays the user's own. Escapes count:
// a double-quoted key is a JSON string, so `"\u0072eloadTranslations"` IS
// `reloadTranslations` and reading it raw made it a silent miss.
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

export function LeadingEscape() {
  const { t } = useI18n();
  const { "\u0072eloadTranslations": reload } = useI18nLoader();
  reload();
  return t("leading");
}

export function InnerEscape() {
  const { locale } = useI18n();
  const { "reload\u0054ranslations": again } = useI18nLoader();
  again();
  return locale;
}
