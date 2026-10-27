// Framework size fixture: the UPPER BOUND of a React app — every export of `@comvi/react`
// and `@comvi/react/format` with the CDN loader, both plugins and devtools on one instance.
import { createElement } from "react";
import { createI18n, I18nHandover, I18nProvider, T, useI18n, useLocale } from "@comvi/react";
import { useFormat } from "@comvi/react/format";
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
  return createElement(
    "p",
    { "aria-busy": isLoading, lang: useLocale() },
    t("items", { count: 2 }),
    createElement(T, { i18nKey: "terms", link: (c: unknown) => createElement("a", null, c) }),
    fmt.currency(9.5, "EUR"),
  );
};

export const app = createElement(
  I18nProvider,
  { i18n, loading: "…" },
  createElement(
    I18nHandover,
    { catalogs: { shop: { en: { items: "{count} items" } } } },
    createElement(Cart),
  ),
);
