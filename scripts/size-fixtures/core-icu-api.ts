// core + ICU + api() over a catalog store (design §3.2): a server or script reading the
// platform API with a project key. Never a browser row (a key in a bundle is readable).
import { createI18n } from "@comvi/core";
import { api, createCatalogStore } from "@comvi/core/cdn";

const loader = api("https://api.comvi.io", {
  key: String(globalThis.process?.env.COMVI_KEY),
  store: createCatalogStore(),
});
const i18n = createI18n({ locale: "en", loader });
export const out = i18n.ready.then(() => [
  i18n.t("hi", { name: "Ann" }),
  i18n.t("items", { count: 2 }),
]);
