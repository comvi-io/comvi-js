import { error } from "@sveltejs/kit";
import { handover } from "@comvi/svelte";
import { fallbackLocale, locales } from "../lib/i18n";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params, locals }) => {
  const locale = params.locale ?? fallbackLocale;
  if (!locales.includes(locale)) error(404, "Not found");

  // One instance per request (made in `hooks.server.ts`): it loads the catalogs and is dropped.
  // Only plain data crosses to the page. A server render is synchronous, so what a route shows loads here:
  // `await i18n.load(ns)` for a namespace beyond `default`.
  const { i18n } = locals;
  await i18n.ready;

  return handover(i18n);
};
