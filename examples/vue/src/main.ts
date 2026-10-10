import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Home from "./Home.vue";
import About from "./About.vue";
import { i18n } from "./i18n";

// The greeting's `{name}`: "Ada", or `?name=…` from the address bar. Whatever
// arrives there is a parameter, and a parameter is rendered as text, never as
// markup: try `?name=<b>Grace</b>`.
const name = new URLSearchParams(location.search).get("name") ?? "Ada";

// The router knows nothing about the locale: it is not part of the path here,
// so a navigation keeps whatever the switcher chose.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Home, props: { name } },
    { path: "/about", component: About, props: { name } },
  ],
});

// `app.use(i18n)` provides the instance to every component and, on the client,
// kicks off `i18n.init()` — which runs the plugins and loads the first catalog.
createApp(App).use(i18n).use(router).mount("#app");
