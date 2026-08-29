// Framework size fixture: the next SERVER graph on a composed BASE host — SSR without
// ICU or tags, every specifier `@comvi/next/server`. Composition goes through
// `.with(attachLoader)`, not `.with(loader())`, because this host registers no import
// map and `loader()` statically references the import-map adapter.
import {
  attachLoader,
  createI18n,
  createNextI18nFromHost,
  getI18n,
  loadTranslations,
  setRequestLocale,
} from "@comvi/next/server";

const { i18n, routing } = createNextI18nFromHost(
  () =>
    createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello, {name}!" } },
    }).with(attachLoader),
  { locales: ["en", "de"], defaultLocale: "en" },
);

console.log(
  i18n.t("greeting" as never, { name: "world" } as never),
  routing.defaultLocale,
  getI18n,
  loadTranslations,
  setRequestLocale,
);
