// Report-only — a computed key hides which hook owns the member.
import { useI18n } from "@comvi/react";

declare const key: "reloadTranslations";

export function Computed() {
  const { t, [key]: dynamic } = useI18n();
  return { t, dynamic };
}
