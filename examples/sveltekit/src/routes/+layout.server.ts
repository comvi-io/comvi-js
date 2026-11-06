import { error } from "@sveltejs/kit";
import { createI18n, handover } from "@comvi/svelte";
import { fallbackLocale, locales, options } from "../lib/i18n";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params }) => {
  // Checked before `createI18n`, which throws a RangeError on anything that is not a tag.
  const locale = params.locale ?? fallbackLocale;
  if (!locales.includes(locale)) error(404, "Not found");

  // One instance per request: it loads the catalogs and is dropped. Only plain data crosses
  // to the page. A server render is synchronous, so what a route shows loads here:
  // `await i18n.load(ns)` for a namespace beyond `default`.
  const i18n = createI18n({ ...options, locale });
  await i18n.ready;

  return handover(i18n);
};
