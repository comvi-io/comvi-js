// core + ICU with the devtools plugin: what an app that opts into the browser extension
// ships (core-icu + the devtools delta).
import { createI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({
  locale: "en",
  messages: { en: { hi: "Hello, {name}!" } },
  plugins: [devtools()],
});
export const out = i18n.t("hi", { name: "Ann" });
