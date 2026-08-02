// Report-only — the hook result is stored and a capability member is read off
// the binding, possibly across a function boundary.
import { useI18n } from "@comvi/react";

export function Stored() {
  const bag = useI18n();
  return () => bag.reloadTranslations();
}

export function DirectAccess() {
  return useI18n().onLoadError;
}

export function StoredButFine() {
  const bag = useI18n();
  return bag.t("greeting");
}

export function StoredSameScope() {
  const bag = useI18n();
  bag.reloadTranslations();
  return null;
}
