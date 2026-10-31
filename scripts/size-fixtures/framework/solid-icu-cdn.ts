// Solid + core + ICU + cdn(): the product's main path on Solid — the instance loading CDN v1
// catalogs, the provider, useI18n() and t() with a plain {name} and a plural. core-icu-cdn.ts
// is the same graph without Solid.
import { createComponent } from "solid-js";
import { createI18n, I18nProvider, useI18n } from "@comvi/solid";
import { cdn } from "@comvi/core/cdn";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/distribution") });

const Cart = () => {
  const { t } = useI18n();
  return [t("hi", { name: "Ann" }), t("items", { count: 2 })];
};

export const app = () =>
  createComponent(I18nProvider, {
    i18n,
    get children() {
      return createComponent(Cart, {});
    },
  });
