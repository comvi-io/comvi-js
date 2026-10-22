import { error } from "@sveltejs/kit";
import { createI18n } from "@comvi/svelte";
import { catalogLoader, fallbackLocale, locales } from "../lib/i18n";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params }) => {
  const locale = params.locale ?? fallbackLocale;
  if (!locales.includes(locale)) error(404, "Not found");

  // One instance per request: it loads the catalogs and is dropped. Only
  // plain data crosses to the page.
  const i18n = createI18n({ locale, fallbackLocale }).use(catalogLoader());
  await i18n.init();

  const namespace = i18n.getDefaultNamespace();
  const messages = Object.fromEntries(
    [locale, fallbackLocale]
      .filter((loc) => i18n.hasLocale(loc, namespace))
      .map((loc) => [`${loc}:${namespace}`, i18n.getMessages(loc, namespace)]),
  );

  return { locale, messages };
};
