import { createApp } from "vue";
import "./main.css";
import App from "./App.vue";
import router from "./router";
import { i18n } from "./i18n";

const app = createApp(App).use(router).use(i18n);

// Mount once the first catalogs are in: no frame shows a raw key.
Promise.all([i18n.ready, router.isReady()]).then(() => app.mount("#app"));
