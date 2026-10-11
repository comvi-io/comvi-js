import { createI18n, I18nProvider, useI18n } from "@comvi/next/client";
const i18n = createI18n({ locale: "en" });
i18n.addMessages("en", { greeting: "Hello, {name}!" } as never);
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
