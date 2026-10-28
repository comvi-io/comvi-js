// Framework size fixture: the UPPER BOUND of a Vue app — every export of `@comvi/vue` and
// `@comvi/vue/format` with the CDN loader, both plugins and devtools on one instance.
import { createApp, h } from "vue";
import { createI18n, handover, T, useI18n } from "@comvi/vue";
import { useFormat } from "@comvi/vue/format";
import { cdn } from "@comvi/core/cdn";
import { detect, persist } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({
  locale: "en",
  timeZone: "UTC",
  loader: cdn("https://cdn.comvi.io/distribution"),
  plugins: [detect({ supported: ["en", "de"] }), persist(), devtools()],
});

const Cart = {
  setup() {
    const { t, isLoading, locale, T: ShopT } = useI18n("shop");
    const fmt = useFormat();
    return () =>
      h("p", { "aria-busy": isLoading.value, lang: locale.value }, [
        t("items", { count: 2 }),
        h(T as never, { i18nKey: "terms", link: (c: string) => h("a", c) }),
        h(ShopT as never, { i18nKey: "title" }),
        fmt.currency(9.5, "EUR"),
      ]);
  },
};

export const app = createApp(Cart).use(i18n);
export const payload = () => handover(i18n);
