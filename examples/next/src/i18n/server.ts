// `server-only` is the marker that keeps this file — and the host registration
// below — out of the client graph.
import "server-only";

import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./config";

// Importing this module is what runs `setI18n()` before any Server Component
// calls `getI18n()`. Skip it and `getI18n()` throws "i18n not configured".
setI18n(i18n);

export { i18n, routing };
export { getI18n, getLocale, loadTranslations, setRequestLocale } from "@comvi/next/server";
