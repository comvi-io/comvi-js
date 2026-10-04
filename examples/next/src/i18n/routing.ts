import { defineRouting } from "@comvi/next/routing";

/** The locales the switcher shows. */
export const locales = ["en", "uk", "de"] as const;

/**
 * Routable but not in the switcher: the right-to-left locale the e2e suite
 * uses to check `<html dir="rtl">`. Its catalog holds two keys; the rest falls
 * back to English.
 */
export const rtlLocale = "ar";

/**
 * The URL rules, and NOTHING else — no instance, no loader, no catalogs.
 *
 * This file exists so `middleware.ts` has something core-free to import.
 * `middleware.ts` runs in the Edge runtime, and an Edge isolate ships and
 * EXECUTES every module its entry reaches on each cold start: importing the
 * composed instance's module for one plain object pulled the whole i18n graph
 * (core, ICU, the loader, the plugin capability, devtools, the tag grammar) into
 * middleware and ran `createNextI18n()` + `registerLoader()` there. Measured
 * with esbuild: 3.8 KB / 7 modules through this file, 30.3 KB / 25 modules
 * through the package root.
 *
 * `config.ts` spreads this back into `createNextI18n`, so there is still one
 * source of truth for the URL rules.
 */
export const routing = defineRouting({
  locales: [...locales, rtlLocale],
  // `always`: every URL carries its locale, so /en, /uk and /de are three real
  // addresses you can link, bookmark and curl. `as-needed` (the default) would
  // serve the default locale from an unprefixed /.
  localePrefix: "always",
  defaultLocale: "en",
});
