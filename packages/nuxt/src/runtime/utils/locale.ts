import type { Ref } from "vue";
import { useI18n } from "@comvi/vue";

/** The locale on screen, reactively: the binding's own `locale` slice of the app's instance. */
export const useLocale = (): Ref<string> => useI18n().locale;
