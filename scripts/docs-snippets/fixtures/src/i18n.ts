/**
 * The composed host a page's fences import when they write `from './i18n'`.
 *
 * Fully composed on purpose — loader, plugins and the ICU compiler — because a
 * fence that imports it goes on to call `i18n.loadTranslations(…)` or
 * `i18n.use(…)`, and a base host would fail those with a capability error that
 * says nothing about the snippet under test.
 */
import { createI18n } from "@comvi/core";
import { icu } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";

export const locales = ["en", "de", "uk", "fr"] as const;
export const defaultLocale = "en";

export const i18n = createI18n({
  locale: defaultLocale,
  fallbackLocale: defaultLocale,
  messages: { en: {} },
})
  .with(icu())
  .with(
    loader({
      de: () => import("./locales/de.json"),
      uk: () => import("./locales/uk.json"),
      fr: () => import("./locales/fr.json"),
    }),
  )
  .with(plugins());

export type AppI18n = typeof i18n;

/** The routing shape `@comvi/next` / `@comvi/nuxt` pages destructure. */
export const routing = { locales, defaultLocale } as const;

export async function loadTranslations(locale: string): Promise<AppI18n> {
  await i18n.loadTranslations(locale);
  return i18n;
}

export const loadI18n = loadTranslations;

export default i18n;
