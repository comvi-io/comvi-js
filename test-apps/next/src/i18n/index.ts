// Server-side i18n entry point
// Import this module to ensure i18n is configured before any translations
import "server-only";

import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./config";

// Configure for server-side usage (called once at module load)
setI18n(i18n);

// Re-export from config
export { i18n, routing };

// Re-export server functions
export { getI18n, loadTranslations } from "@comvi/next/server";

// Re-export routing utilities
export { hasLocale } from "@comvi/next/routing";
