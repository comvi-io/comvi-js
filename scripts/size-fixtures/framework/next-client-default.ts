// Framework size fixture: the Next.js CLIENT graph of the 0.8 recipe — `<I18nProvider payload>`
// from `@comvi/next/client` (the instance created from the server's payload, `<I18nHandover>`
// for later payloads, the routing context) and a Client Component reading through
// `@comvi/react`: t() with a plain {name} and a plural.
import { createElement } from "react";
import { I18nProvider } from "@comvi/next/client";
import { useI18n } from "@comvi/react";

const Cart = () => {
  const { t } = useI18n();
  return createElement("p", null, t("hi", { name: "Ann" }), t("items", { count: 2 }));
};

export const app = createElement(
  I18nProvider,
  {
    payload: { locale: "en", timeZone: "UTC", serverNow: 0, catalogs: {} },
    options: { fallbackLocale: "en" },
    routing: { locales: ["en", "de"], defaultLocale: "en" },
  },
  createElement(Cart),
);
