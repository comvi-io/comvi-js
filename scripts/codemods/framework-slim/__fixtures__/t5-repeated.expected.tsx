// T5 — several useI18n destructures in one function collapse onto ONE
// useI18nLoader() call and ONE useI18nPlugins() call.
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

export function Repeated() {
  const { t } = useI18n();
  const { addActiveNamespace, reloadTranslations, onLoadError } = useI18nLoader();
  const { locale } = useI18n("other");
  const { onMissingKey } = useI18nPlugins();
  return { t, locale, addActiveNamespace, reloadTranslations, onMissingKey, onLoadError };
}

export function OtherFunctionGetsItsOwn() {
  const { reloadTranslations } = useI18nLoader();
  return reloadTranslations;
}
