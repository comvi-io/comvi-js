// Report-only — a rest spread would silently stop carrying the moved members.
import { useI18n } from "@comvi/react";

export function Spread() {
  const { t, ...rest } = useI18n();
  return { t, rest };
}
