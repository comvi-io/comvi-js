import { createI18n } from "@comvi/core";
const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello, {name}!" } } });
console.log(i18n.t("greeting" as never, { name: "world" } as never));
