// T2 — pure plugins destructure.
import { useI18nPlugins } from "@comvi/react";

export function MissingKeys() {
  const { onMissingKey } = useI18nPlugins();
  return onMissingKey;
}
