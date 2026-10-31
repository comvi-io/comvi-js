// Framework size fixture: THE DEFAULT Solid app — one `@comvi/solid` specifier, bundled
// catalogs, the provider and useI18n() with t({name}).
import { createComponent } from "solid-js";
import { createI18n, I18nProvider, useI18n } from "@comvi/solid";

const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello, {name}!" } } });

const Hello = () => useI18n().t("greeting", { name: "Ann" });

export const app = () =>
  createComponent(I18nProvider, {
    i18n,
    get children() {
      return createComponent(Hello, {});
    },
  });
