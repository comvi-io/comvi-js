// T2 — pure plugins destructure.
import { useI18n } from "@comvi/react";

export function MissingKeys() {
  const { onMissingKey } = useI18n("errors");
  return onMissingKey;
}
