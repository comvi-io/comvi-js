import { createI18n, I18nProvider, useI18n } from "@comvi/react";
const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello, {name}!" } } });
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
