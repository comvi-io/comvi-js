// `@comvi/next/server` carries its own `server-only` guard, so a Client
// Component that imports this file fails `next build`.
import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./config";

// Importing this module is what runs `setI18n()` before any Server Component
// calls `getI18n()`. Skip it and `getI18n()` throws "i18n not configured".
setI18n(i18n);

export { i18n, routing };
export { getI18n, getLocale, loadTranslations, setRequestLocale } from "@comvi/next/server";
