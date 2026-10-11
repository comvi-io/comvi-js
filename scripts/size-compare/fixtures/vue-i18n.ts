import { createI18n, useI18n } from "vue-i18n";
const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" } },
});
console.log(i18n.global.t("greeting", { name: "world" }), useI18n);
