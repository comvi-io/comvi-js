// core + ICU + cdn() (R3-13 ceiling 4,895): the product's main path — the instance
// loading CDN v1 catalogs, then t() with a plain {name} and a plural.
import { createI18n } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/distribution") });
export const out = i18n.ready.then(() => [
  i18n.t("hi", { name: "Ann" }),
  i18n.t("items", { count: 2 }),
]);
