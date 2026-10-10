<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

// The second page. The module clones every page under `pages/` into each
// locale prefix, so this is /en/about, /uk/about and /de/about, and
// <NuxtLinkLocale> takes the way back to `/` in the same language.
const { t, locale, isLoading, activeNamespaces } = useI18n();

// A second namespace, loaded by this page alone. `useI18n("account")` scopes
// `t()` to it and loads nothing; `addActiveNamespace("account")` is what
// fetches it. The page AWAITS the activation, so the server renders the
// namespace's text (and loads its fallback chain) and a client navigation
// shows the page only once the catalog is in.
const { t: tAccount } = useI18n("account");
const { addActiveNamespace } = useI18nLoader();
const route = useRoute();
const name = computed(() => (typeof route.query.name === "string" ? route.query.name : "Ada"));

// Read on the client only, as the first page does: the server's instance and
// the browser's are two different objects. The page's own activation below
// moves `isLoading` while the browser is still hydrating, so the watcher only
// writes once the page has mounted; before that the line must match the server.
const namespaces = ref<string[]>([]);
let mounted = false;
watch([locale, isLoading], () => {
  if (mounted) namespaces.value = activeNamespaces.value;
});

onMounted(() => {
  mounted = true;
  namespaces.value = activeNamespaces.value;
  // A marker for the e2e suite: set once Vue has hydrated this page.
  document.documentElement.dataset.hydrated = "true";
});

await addActiveNamespace("account");
</script>

<template>
  <main>
    <header class="hero">
      <h1>{{ t("app.title") }}</h1>
      <p class="intro">{{ t("demo.intro") }}</p>
      <LocaleSwitcher />
    </header>

    <div class="cards">
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.navigation.title") }}</h2>
        <p class="widget" data-testid="about-body">{{ t("about.body") }}</p>
        <!-- a second namespace, fetched when this page is first opened -->
        <!-- prettier-ignore -->
        <p class="widget" data-testid="account-signed-in">{{ tAccount("profile.signed_in", { name }) }}</p>
        <!-- prettier-ignore -->
        <p class="widget" data-testid="account-devices">{{ tAccount("profile.devices", { count: 3 }) }}</p>
        <!-- Only `account/en.json` has this key: the fallback chain is walked
             inside the same namespace, once that namespace's en catalog is in. -->
        <p class="widget" data-testid="account-only-en">{{ tAccount("profile.only_en") }}</p>
        <p class="widget">
          <NuxtLinkLocale class="cta" data-testid="nav-home" to="/">{{
            t("nav.home")
          }}</NuxtLinkLocale>
        </p>
      </section>

      <section class="card">
        <h2 class="eyebrow">{{ t("demo.lazy.title") }}</h2>
        <p class="body">{{ t("demo.lazy.body") }}</p>
        <div class="network">
          <code>{{ t("demo.lazy.namespaces", { namespaces: namespaces.join(", ") }) }}</code>
        </div>
      </section>
    </div>

    <AppFooter />
  </main>
</template>
