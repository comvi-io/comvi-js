// Report-only — sibling `switch` cases share ONE scope, so a merge across them
// has no sound position: a call per case redeclares the same `const`, and one
// call in the first case leaves the read in the second in the temporal dead
// zone when that case is skipped. Brace the cases and both migrate.
import { useI18n } from "@comvi/react";

export function Bare(kind: number) {
  switch (kind) {
    case 1:
      const { reloadTranslations } = useI18n();
      reloadTranslations();
      break;
    case 2:
      const { onLoadError } = useI18n();
      onLoadError(() => {});
      break;
  }
}
