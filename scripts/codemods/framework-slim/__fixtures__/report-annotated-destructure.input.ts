// Report-only — an annotation describes the WHOLE destructured shape, and a
// split has two shapes, so it cannot be divided between the halves.
import { useI18n } from "@comvi/react";

interface Bag {
  t: (key: string) => string;
  reloadTranslations: () => Promise<void>;
}

export function Annotated() {
  const { t, reloadTranslations }: Bag = useI18n();
  return { t, reloadTranslations };
}
