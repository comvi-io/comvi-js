// Imported for its side effect: i18n must be configured before any translation.
import "server-only";

import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./config";

setI18n(i18n);

export { i18n, routing };

export { getI18n, loadTranslations } from "@comvi/next/server";

export { hasLocale } from "@comvi/next/routing";
