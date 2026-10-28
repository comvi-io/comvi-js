import { createSSRApp } from "vue";
import { createI18n, type Handover } from "@comvi/vue";
import { App, options } from "./app";

const payload = (window as { __I18N__?: Handover }).__I18N__;
// With the server's payload the browser starts from what the server rendered; without it
// (the gate's red variant) it starts from the locale alone and loads.
const i18n = createI18n({
  ...options(`${location.origin}/cdn`),
  ...(payload ?? { locale: document.documentElement.lang }),
});
createSSRApp(App).use(i18n).mount("#app");
(window as { __hydrated?: boolean }).__hydrated = true;
