import type { Handle } from "@sveltejs/kit/hooks";
import { dir } from "@comvi/core/internal";
import { fallbackLocale, locales } from "./lib/i18n";

export const handle: Handle = ({ event, resolve }) => {
  const segment = event.params.locale;
  const lang = segment && locales.includes(segment) ? segment : fallbackLocale;

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%lang%", lang).replace("%dir%", dir(lang)),
  });
};
