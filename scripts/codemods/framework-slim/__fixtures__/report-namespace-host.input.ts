// Report-only — namespace host factories need a named import before migration.
import * as comvi from "@comvi/react";

export const i18n = comvi.createI18n({ locale: "en", exposeGlobal: false });
