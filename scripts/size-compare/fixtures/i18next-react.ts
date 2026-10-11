import i18next from "i18next";
import { initReactI18next, useTranslation, I18nextProvider } from "react-i18next";
void i18next
  .use(initReactI18next)
  .init({ lng: "en", resources: { en: { translation: { greeting: "Hello, {{name}}!" } } } });
console.log(i18next.t("greeting", { name: "world" }), I18nextProvider, useTranslation);
