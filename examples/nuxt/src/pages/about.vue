<script setup lang="ts">
import { computed, onMounted } from "vue";

// The second page. The module clones every page under `pages/` into each
// locale prefix, so this is /en/about, /uk/about and /de/about, and
// <NuxtLinkLocale> takes the way back to `/` in the same language.
const { t } = useI18n();

// A second namespace, loaded by this page alone. `useI18n("account")` scopes
// `t()` to it and loads nothing; `addActiveNamespace("account")` is what
// fetches it. The page AWAITS the activation, so the server renders the
// namespace's text (and loads its fallback chain) and a client navigation
// shows the page only once the catalog is in.
const { t: tAccount } = useI18n("account");
const { addActiveNamespace } = useI18nLoader();
const route = useRoute();
const name = computed(() => (typeof route.query.name === "string" ? route.query.name : "Ada"));

onMounted(() => {
  // A marker for the e2e suite: set once Vue has hydrated this page.
  document.documentElement.dataset.hydrated = "true";
});

await addActiveNamespace("account");
</script>

<template>
  <main>
    <h1>{{ t("app.title") }}</h1>
    <LocaleSwitcher />
    <section>
      <h2>navigation</h2>
      <p data-testid="about-body">{{ t("about.body") }}</p>
      <p>
        <NuxtLinkLocale data-testid="nav-home" to="/">{{ t("nav.home") }}</NuxtLinkLocale>
      </p>
    </section>
    <!-- 10 — a second namespace, fetched when this page is first opened -->
    <section>
      <h2>namespace</h2>
      <p data-testid="account-signed-in">{{ tAccount("profile.signed_in", { name }) }}</p>
      <p data-testid="account-devices">{{ tAccount("profile.devices", { count: 3 }) }}</p>
      <!-- Only `account/en.json` has this key: the fallback chain is walked
           inside the same namespace, once that namespace's en catalog is in. -->
      <p data-testid="account-only-en">{{ tAccount("profile.only_en") }}</p>
    </section>
  </main>
</template>
