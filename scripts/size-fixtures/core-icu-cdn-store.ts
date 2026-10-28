// core + ICU + cdn() over a catalog store (design §2.3 item 6, R4-13): the server path —
// one createCatalogStore() per process, an instance per request. Not a browser row: what
// the store and its revalidation cost on top of core-icu-cdn.
import { createI18n } from "@comvi/core";
import { cdn, createCatalogStore } from "@comvi/core/cdn";

const store = createCatalogStore({ ttl: 30_000 });
const loader = cdn("https://cdn.comvi.io/distribution", { store });
const i18n = createI18n({ locale: "en", loader });
export const out = i18n.ready.then(() => [
  i18n.t("hi", { name: "Ann" }),
  i18n.t("items", { count: 2 }),
]);
