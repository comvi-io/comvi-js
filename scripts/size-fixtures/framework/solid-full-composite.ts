// Framework size fixture: the UPPER BOUND of a Solid app — every export of `@comvi/solid` and
// `@comvi/solid/format` with the CDN loader, both plugins and devtools on one instance.
import { createComponent } from "solid-js";
import { createI18n, handover, I18nProvider, T, useI18n } from "@comvi/solid";
import { useFormat } from "@comvi/solid/format";
import { cdn } from "@comvi/core/cdn";
import { detect, persist } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({
  locale: "en",
  loader: cdn("https://cdn.comvi.io/distribution"),
  plugins: [detect({ supported: ["en", "de"] }), persist(), devtools()],
});

const Cart = () => {
  const { t, isLoading } = useI18n("shop");
  const fmt = useFormat();
  return [
    isLoading(),
    t("items", { count: 2 }),
    createComponent(T as (p: object) => unknown as never, {
      i18nKey: "terms",
      components: { link: "a" },
    }),
    fmt.currency(9.5, "EUR"),
  ];
};

export const app = () =>
  createComponent(I18nProvider, {
    i18n,
    loading: "…",
    get children() {
      return createComponent(Cart, {});
    },
  });
export const payload = () => handover(i18n);
