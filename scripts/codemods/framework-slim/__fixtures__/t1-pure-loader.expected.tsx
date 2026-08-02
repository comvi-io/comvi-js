// T1 — pure loader destructure, `ns` argument dropped.
import { useI18nLoader } from "@comvi/react";

export function Namespaces() {
  const { addActiveNamespace, reloadTranslations } = useI18nLoader();
  return { addActiveNamespace, reloadTranslations };
}

export function OneMember() {
  const { onLoadError } = useI18nLoader();
  return onLoadError;
}
