import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";
import { booted, options } from "../options.js";

const i18n = createI18n(options());
const app = createApp(App).use(i18n);
i18n.ready.then(() => {
  app.mount("#app");
  booted();
});
