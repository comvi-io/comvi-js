// a nested inline catalog is NOT a migration. The base host flattens
// `{ nav: { home } }` itself, unconditionally, at the one seam a catalog
// enters — so `{ nav: { home } }` and `{ "nav.home": … }` are the same catalog
// on every host, composed or bare. 0.4 needed `flattenCatalog` here only
// because flattening was an optional capability hook.
//
// So this file comes back BYTE-IDENTICAL with an EMPTY report: no wrap, no
// advisory, no manual item, because there is nothing for the reader to do. Both
// units the old rule walked are here — a locale key and a `"locale:ns"` key —
// beside a catalog that was already flat.
import { createI18n } from "@comvi/core";

export const i18n = createI18n({
  locale: "en",
  translation: {
    en: { nav: { home: "Home", about: "About" }, title: "Comvi" },
    de: { "nav.home": "Start", "nav.about": "Über uns" },
    "en:footer": { legal: { imprint: "Imprint" } },
  },
});
