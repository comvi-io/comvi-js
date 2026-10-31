// Framework size fixture: the UPPER BOUND of a Svelte app: every export of `@comvi/svelte` and
// `@comvi/svelte/format` with the CDN loader, both plugins and devtools on one instance.
import { createI18n, handover, setI18n, T, useI18n } from "@comvi/svelte";
import { useFormat } from "@comvi/svelte/format";
import { cdn } from "@comvi/core/cdn";
import { detect, persist } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({
  locale: "en",
  timeZone: "UTC",
  loader: cdn("https://cdn.comvi.io/distribution"),
  plugins: [detect({ supported: ["en", "de"] }), persist(), devtools()],
});

export const setup = () => {
  setI18n(i18n);
  const { t, isLoading, locale, T: ShopT } = useI18n("shop");
  const fmt = useFormat();
  return [t("items", { count: 2 }), isLoading, locale, ShopT, T, fmt.currency(9.5, "EUR")];
};
export const payload = () => handover(i18n);
