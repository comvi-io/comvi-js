import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import AboutPage from "./pages/AboutPage.vue";
import HomePage from "./pages/HomePage.vue";
import { i18n } from "./i18n";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/about", component: AboutPage },
  ],
});

// `app.use(i18n)` provides the instance to every component and starts
// `i18n.init()`, which loads the first catalog.
createApp(App).use(i18n).use(router).mount("#app");
