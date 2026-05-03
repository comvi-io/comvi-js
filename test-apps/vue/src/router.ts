import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("./views/HomeView.vue"),
    },
    {
      path: "/plurals",
      name: "plurals",
      component: () => import("./views/PluralsView.vue"),
    },
    {
      path: "/rich-text",
      name: "rich-text",
      component: () => import("./views/RichTextView.vue"),
    },
    {
      path: "/namespaces",
      name: "namespaces",
      component: () => import("./views/NamespacesView.vue"),
    },
    {
      path: "/rtl",
      name: "rtl",
      component: () => import("./views/RtlView.vue"),
    },
  ],
});

export default router;
