// The merge unit is the BLOCK: a capability call inside the `if` must not
// swallow a member whose only reference is after the block.
import { useI18n } from "@comvi/react";

export function Conditional(flag: boolean) {
  if (flag) {
    const { reloadTranslations } = useI18n();
    reloadTranslations();
  }
  const { onLoadError } = useI18n();
  onLoadError(() => {});
}

export function IntoBlockLocalExisting(flag: boolean) {
  if (flag) {
    const { addActiveNamespace } = useI18n();
    addActiveNamespace("panel");
  }
  const { t, onLoadError } = useI18n();
  onLoadError(() => {});
  return t("x");
}
