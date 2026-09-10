// A T3 split of an exported destructure keeps `export` on BOTH halves: the
// keyword sits in front of the replaced range and covers only the first one.
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

export const { t } = useI18n();
export const { reloadTranslations } = useI18nLoader();
export let { locale } = useI18n("panel");
export let { onMissingKey } = useI18nPlugins();
