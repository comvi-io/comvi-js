import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";

// `app.use(i18n)` provides the instance to every component and, on the client,
// kicks off `i18n.init()` — which runs the plugins and loads the first catalog.
createApp(App).use(i18n).mount("#app");
