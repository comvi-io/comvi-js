// `flattenCatalog` left `@comvi/core/loader`: flattening stopped being that
// capability's escape hatch when the base host took it over, so 0.5.0 publishes
// the pure flattener from the `@comvi/core` ROOT only.
//
// The function and every CALL to it are unchanged, so the module specifier is
// the whole migration — the clause names it alone, so it is retargeted in
// place. The nested catalog below is left exactly as written: it never needed
// the flattener.
//
// The retarget is a pure splice, so a file that already imports from
// `@comvi/core` comes out with two imports of it. That is the trade the `/slim`
// rewrite makes too: deleting a statement is a bigger edit than this migration
// needs, and one formatter pass folds the two lines together.
import { createI18n } from "@comvi/core";
import { flattenCatalog } from "@comvi/core/loader";

const keys = Object.keys(flattenCatalog({ nav: { home: "Home" } }));

export const i18n = createI18n({
  locale: "en",
  translation: { en: { nav: { home: "Home" } } },
});

export { keys };
