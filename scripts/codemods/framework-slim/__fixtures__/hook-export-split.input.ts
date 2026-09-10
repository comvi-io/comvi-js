// A T3 split of an exported destructure keeps `export` on BOTH halves: the
// keyword sits in front of the replaced range and covers only the first one.
import { useI18n } from "@comvi/react";

export const { t, reloadTranslations } = useI18n();
export let { locale, onMissingKey } = useI18n("panel");
