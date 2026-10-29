// Vue + core + ICU + cdn() (R3-25 binding cap: +600 B over core-icu-cdn): the product's main
// path on Vue — the instance loading CDN v1 catalogs, app.use(i18n), useI18n() and t() with a
// plain {name} and a plural. core-icu-cdn.ts is the same graph without Vue.
import { createApp, h } from "vue";
import { createI18n, useI18n } from "@comvi/vue";
import { cdn } from "@comvi/core/cdn";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/distribution") });

const Cart = {
  setup() {
    const { t } = useI18n();
    return () => h("p", [t("hi", { name: "Ann" }), t("items", { count: 2 })]);
  },
};

export const app = createApp(Cart).use(i18n);
