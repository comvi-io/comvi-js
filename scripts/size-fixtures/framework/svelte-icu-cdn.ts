// Svelte + core + ICU + cdn(): the product's main path on Svelte: the instance loading CDN v1
// catalogs, setI18n(), useI18n() and t() with a plain {name} and a plural. core-icu-cdn.ts is
// the same graph without Svelte.
import { createI18n, setI18n, useI18n } from "@comvi/svelte";
import { cdn } from "@comvi/core/cdn";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/distribution") });

export const setup = () => {
  setI18n(i18n);
  const { t } = useI18n();
  return [t("hi", { name: "Ann" }), t("items", { count: 2 })];
};
