import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import AboutPage from "./pages/AboutPage.vue";
import FeaturesPage from "./pages/FeaturesPage.vue";
import StartPage from "./pages/StartPage.vue";
import { i18n } from "./i18n";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: StartPage },
    { path: "/features", component: FeaturesPage },
    {
      path: "/about",
      component: AboutPage,
      // The page's own namespace loads with the route, before the page renders:
      // no frame shows its keys. Once loaded, it follows every language switch.
      beforeEnter: () => i18n.load("account"),
    },
  ],
});

// `app.use(i18n)` gives every component `useI18n()`, `<T>` and `$t`.
const app = createApp(App).use(i18n).use(router);

// The page shows a wordless spinner (index.html) until the first catalogs and
// the first route are in, so no frame ever shows a raw key. Later loads (a
// page's namespace, a language switch) keep the app on screen.
Promise.all([i18n.ready, router.isReady()]).then(() => app.mount("#app"));
