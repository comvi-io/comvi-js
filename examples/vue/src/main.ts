import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";

// `init()` runs the plugins and loads the first catalog. Mounting after it
// resolves means no frame shows a raw key; `app.use(i18n)` would start
// `init()` on its own, but the page would render keys until the catalog landed.
void i18n.init().then(() => createApp(App).use(i18n).mount("#app"));
