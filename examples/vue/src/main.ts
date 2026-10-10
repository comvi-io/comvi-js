import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import AboutPage from "./pages/AboutPage.vue";
import HomePage from "./pages/HomePage.vue";
import { i18n } from "./i18n";

// Try `?name=<b>Grace</b>`: a parameter is always rendered as text.
const name = new URLSearchParams(location.search).get("name") ?? "Ada";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage, props: { name } },
    { path: "/about", component: AboutPage, props: { name } },
  ],
});

// `app.use(i18n)` provides the instance to every component and starts
// `i18n.init()`, which loads the first catalog.
createApp(App).use(i18n).use(router).mount("#app");
