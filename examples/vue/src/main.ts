import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import AboutPage from "./pages/AboutPage.vue";
import FeaturesPage from "./pages/FeaturesPage.vue";
import StartPage from "./pages/StartPage.vue";
import { i18n } from "./i18n";

declare module "vue-router" {
  interface RouteMeta {
    /** Set by the `/about` route when its `account` namespace failed to load. */
    accountFailed?: boolean;
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: StartPage },
    { path: "/features", component: FeaturesPage },
    {
      path: "/about",
      component: AboutPage,
      // The page's own namespace loads with the route, before the page renders:
      // no frame shows its keys. While the page shows, its useI18n("account")
      // holds the namespace, so a language switch loads it too; once the page
      // closes it stays cached and a switch skips it (the route loads it again).
      // A failed load resolves with the Error (and is reported through onError): the
      // page still opens, and offers to load it again. The guard returns nothing, so
      // the router never reads the outcome as a navigation result.
      beforeEnter: async (to) => {
        const failure = await i18n.load("account");
        to.meta.accountFailed = failure !== undefined;
      },
    },
  ],
});

// `app.use(i18n)` gives every component `useI18n()`, `<T>` and `$t`.
const app = createApp(App).use(i18n).use(router);

// The page shows a wordless spinner (index.html) until the first catalogs and
// the first route are in, so no frame ever shows a raw key. Later loads (a
// page's namespace, a language switch) keep the app on screen.
Promise.all([i18n.ready, router.isReady()]).then(() => app.mount("#app"));
