import type { Handle } from "@sveltejs/kit/hooks";
import { createI18n } from "@comvi/svelte";
import { fallbackLocale, locales, options } from "./lib/i18n";

export const handle: Handle = ({ event, resolve }) => {
  const segment = event.params.locale;
  const lang = segment && locales.includes(segment) ? segment : fallbackLocale;

  // This request's instance: the layout load fetches its catalogs, the page reads its `dir`.
  const i18n = createI18n({ ...options, locale: lang });
  event.locals.i18n = i18n;

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%lang%", lang).replace("%dir%", i18n.dir),
  });
};
