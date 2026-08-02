// T5 — several useI18n destructures in one function collapse onto ONE
// useI18nLoader() call and ONE useI18nPlugins() call.
import { useI18n } from "@comvi/react";

export function Repeated() {
  const { t, addActiveNamespace } = useI18n();
  const { locale, reloadTranslations } = useI18n("other");
  const { onMissingKey } = useI18n();
  const { onLoadError } = useI18n();
  return { t, locale, addActiveNamespace, reloadTranslations, onMissingKey, onLoadError };
}

export function OtherFunctionGetsItsOwn() {
  const { reloadTranslations } = useI18n();
  return reloadTranslations;
}
