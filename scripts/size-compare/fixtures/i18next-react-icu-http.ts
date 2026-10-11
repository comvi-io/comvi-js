import i18next from "i18next";
import ICU from "i18next-icu";
import HttpBackend from "i18next-http-backend";
import { initReactI18next, useTranslation, I18nextProvider } from "react-i18next";
void i18next
  .use(ICU)
  .use(HttpBackend)
  .use(initReactI18next)
  .init({ lng: "en", backend: { loadPath: "https://example.com/locales/{{lng}}/{{ns}}.json" } })
  .then(() => console.log(i18next.t("items", { count: 2 }), I18nextProvider, useTranslation));
