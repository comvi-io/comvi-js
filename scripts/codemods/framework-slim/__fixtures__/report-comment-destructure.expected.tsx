// Report-only — a split re-prints the statement, and nothing says which half
// a comment between two members belongs to.
import { useI18n } from "@comvi/react";

export function Commented() {
  const {
    t, // the translator
    reloadTranslations, // capability
  } = useI18n();
  return { t, reloadTranslations };
}
