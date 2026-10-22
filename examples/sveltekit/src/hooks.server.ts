import type { Handle } from "@sveltejs/kit/hooks";
import { getTextDirection } from "@comvi/core";
import { fallbackLocale, locales } from "./lib/i18n";

export const handle: Handle = ({ event, resolve }) => {
  const segment = event.params.locale;
  const lang = segment && locales.includes(segment) ? segment : fallbackLocale;

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%lang%", lang).replace("%dir%", getTextDirection(lang)),
  });
};
