// Framework size fixture: THE DEFAULT Vue app — one `@comvi/vue` specifier, bundled
// catalogs, app.use(i18n) and useI18n() with t({name}).
import { createApp, h } from "vue";
import { createI18n, useI18n } from "@comvi/vue";

const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello, {name}!" } } });

const Hello = { setup: () => () => h("h1", useI18n().t("greeting", { name: "Ann" })) };

export const app = createApp(Hello).use(i18n);
