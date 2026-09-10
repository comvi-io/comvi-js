// The merge unit is the BLOCK: a capability call inside the `if` must not
// swallow a member whose only reference is after the block.
import { useI18n, useI18nLoader } from "@comvi/react";

export function Conditional(flag: boolean) {
  if (flag) {
    const { reloadTranslations } = useI18nLoader();
    reloadTranslations();
  }
  const { onLoadError } = useI18nLoader();
  onLoadError(() => {});
}

export function IntoBlockLocalExisting(flag: boolean) {
  if (flag) {
    const { addActiveNamespace } = useI18nLoader();
    addActiveNamespace("panel");
  }
  const { t } = useI18n();
  const { onLoadError } = useI18nLoader();
  onLoadError(() => {});
  return t("x");
}
