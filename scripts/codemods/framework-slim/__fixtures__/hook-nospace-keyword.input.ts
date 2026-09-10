// The declaration keyword is read from the front of the declaration: this
// source has no whitespace after `const` at all, and no prettier pass to add
// any.
import{useI18n}from"@comvi/react";

export function Compact() {
  const{t,reloadTranslations}=useI18n();
  reloadTranslations();
  return t("x");
}

export function CompactVar() {
  var{locale,onMissingKey}=useI18n("panel");
  onMissingKey(() => "");
  return locale;
}
