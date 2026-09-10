// Report-only — a comment in the part of the statement the split RE-PRINTS
// (the keyword, the pattern, the `=`) has nowhere to go, so it is reported
// instead of dropped. A comment on its own line, or after the call, is not in
// that range and does not block the rewrite.
import { useI18n } from "@comvi/react";

export function AfterKeyword() {
  const /* mid */ { t, reloadTranslations } = useI18n();
  reloadTranslations();
  return t("x");
}

export function BeforeEquals() {
  const { t, onLoadError } /* after */ = useI18n();
  onLoadError(() => {});
  return t("x");
}
