import { defineRouting } from "@comvi/next/routing";

/**
 * The URL rules alone, so `middleware.ts` imports a core-free module: an Edge
 * isolate executes every module its entry reaches, and `./config` would pull
 * the composed i18n instance and its loader into middleware. `config.ts`
 * spreads this object back into `createNextI18n`, so the rules stay one source.
 */
export const routing = defineRouting({
  locales: ["en", "de", "fr", "es", "uk", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
