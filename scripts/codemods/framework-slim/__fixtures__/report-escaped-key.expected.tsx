// Report-only — a quoted key whose escapes cannot be decoded is refused rather
// than read raw: reading `'\u0072eloadTranslations'` literally made it a member
// the migration table does not know, so the file came back unchanged with a
// "nothing to migrate" all-clear. Double-quoted escapes ARE decoded (they are
// JSON); a single-quoted one is not JSON, so it fails closed.
import { useI18n } from "@comvi/react";

export function SingleQuotedEscape() {
  const { '\u0072eloadTranslations': reload, t } = useI18n();
  reload();
  return t("x");
}
