// The declaration keyword is read from the front of the declaration: this
// source has no whitespace after `const` at all, and no prettier pass to add
// any.
import{useI18n, useI18nLoader, useI18nPlugins}from"@comvi/react";

export function Compact() {
  const { t } = useI18n();
  const { reloadTranslations } = useI18nLoader();
  reloadTranslations();
  return t("x");
}

export function CompactVar() {
  var { locale } = useI18n("panel");
  var { onMissingKey } = useI18nPlugins();
  onMissingKey(() => "");
  return locale;
}
