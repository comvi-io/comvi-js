// a base host stores catalogs AS GIVEN, so a nested inline catalog
// gets the explicit flattener (nested catalogs: dev-warn at runtime,
// `flattenCatalog` in the migration).
//
// Per LOCALE, because that is the unit the host ingests — and only where nesting
// is VISIBLE: a catalog that is already flat is left exactly as it is.
import { createI18n } from "@comvi/core";

export const i18n = createI18n({
  locale: "en",
  translation: {
    en: { nav: { home: "Home", about: "About" }, title: "Comvi" },
    de: { "nav.home": "Start", "nav.about": "Über uns" },
    "en:footer": { legal: { imprint: "Imprint" } },
  },
});
