// React + core + ICU + cdn() (R3-10 binding cap: +547 B over core-icu-cdn): the product's
// main path on React — the instance loading CDN v1 catalogs, the provider, useI18n() and
// t() with a plain {name} and a plural. core-icu-cdn.ts is the same graph without React.
import { createElement } from "react";
import { createI18n, I18nProvider, useI18n } from "@comvi/react";
import { cdn } from "@comvi/core/cdn";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/distribution") });

const Cart = () => {
  const { t } = useI18n();
  return createElement("p", null, t("hi", { name: "Ann" }), t("items", { count: 2 }));
};

export const app = createElement(I18nProvider, { i18n }, createElement(Cart));
