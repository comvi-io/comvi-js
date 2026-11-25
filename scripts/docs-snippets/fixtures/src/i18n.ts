/**
 * The instance a page's fences import when they write `from './i18n'`.
 *
 * The 0.8 shape a page sets up: `createI18n` with inline messages for the
 * source locale and the CDN loader for the rest. A fence that imports it goes
 * on to call `i18n.setLocale(…)`, `i18n.load(ns)` or `t()`, which every 0.8
 * instance has — there is nothing to compose.
 */
import { createI18n } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";

export const locales = ["en", "de", "uk", "fr"] as const;
export const defaultLocale = "en";

export const i18n = createI18n({
  locale: defaultLocale,
  fallbackLocale: defaultLocale,
  messages: { en: {} },
  loader: cdn("https://cdn.comvi.io/your-distribution-id"),
});

export type AppI18n = typeof i18n;

/** The routing shape `@comvi/next` / `@comvi/nuxt` pages destructure. */
export const routing = { locales, defaultLocale } as const;

export async function loadMessages(locale: string): Promise<AppI18n> {
  await i18n.setLocale(locale);
  return i18n;
}

export const loadI18n = loadMessages;

export default i18n;
