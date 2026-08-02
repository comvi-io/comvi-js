// T1 — pure loader destructure, `ns` argument dropped.
import { useI18n } from "@comvi/react";

export function Namespaces() {
  const { addActiveNamespace, reloadTranslations } = useI18n("dashboard");
  return { addActiveNamespace, reloadTranslations };
}

export function OneMember() {
  const { onLoadError } = useI18n();
  return onLoadError;
}
