<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

// Auto-imported by the module — there is no `import { useI18n }` anywhere in a
// Nuxt app.
const { t, locale, isLoading, formatNumber, formatDate, loadedLocales, activeNamespaces } =
  useI18n();

// `useState`, not `ref`: switching the locale NAVIGATES to /uk or /de, which
// remounts this page. Nuxt's shared state outlives the remount (and travels
// from the server to the browser in the payload), so the count survives it.
const count = useState("count", () => 2);

// ICU select: one sentence per value, every variant the translator's.
const genders = ["female", "male", "other"] as const;
const gender = useState<(typeof genders)[number]>("gender", () => "female");

// A currency, formatted by the platform's Intl for the active locale.
const price = computed(() =>
  new Intl.NumberFormat(locale.value, { style: "currency", currency: "EUR" }).format(1234.5),
);

// The greeting's `{name}`: "Ada", or `?name=…` from the address bar, on the
// server and in the browser alike. Whatever arrives there is a parameter, and a
// parameter is rendered as text, never as markup: try `?name=<b>Grace</b>`.
const route = useRoute();
const name = computed(() => (typeof route.query.name === "string" ? route.query.name : "Ada"));

const RELEASED = new Date("2026-09-01T00:00:00Z");

// Read on the CLIENT only. The module builds one instance per server request and a
// separate one in the browser, so the catalogs "fetched so far" is a fact about
// this browser — rendering it during SSR would print one list on the server and
// another after hydration. The same goes for the active namespaces.
const fetched = ref<string[]>([]);
const namespaces = ref<string[]>([]);
onMounted(() => {
  fetched.value = loadedLocales.value;
  namespaces.value = activeNamespaces.value;
  // A marker for the e2e suite: set once Vue has hydrated this page, so a test
  // can tell the server's HTML from the live page.
  document.documentElement.dataset.hydrated = "true";
});
watch([locale, isLoading], () => {
  fetched.value = loadedLocales.value;
  namespaces.value = activeNamespaces.value;
});
</script>

<template>
  <main>
    <header class="hero">
      <h1>{{ t("app.title") }}</h1>
      <p class="intro">{{ t("demo.intro") }}</p>
      <!-- the locale switcher, `components/LocaleSwitcher.vue` -->
      <LocaleSwitcher />
    </header>

    <div class="cards">
      <!-- a string with a parameter -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.interpolation.title") }}</h2>
        <p class="body">{{ t("demo.interpolation.body") }}</p>
        <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
      </section>

      <!-- an ICU plural, live on a counter. The compiler was named in
           `comvi.i18n.ts`; the module's own generated instance would render the
           braced segment literally. -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.plural.title") }}</h2>
        <p class="body">{{ t("demo.plural.body") }}</p>
        <div class="widget counter">
          <button class="step" data-testid="cart-dec" @click="count = Math.max(0, count - 1)">
            −
          </button>
          <span data-testid="cart">{{ t("cart.items", { count }) }}</span>
          <button class="step" data-testid="cart-inc" @click="count++">+</button>
        </div>
      </section>

      <!-- ICU selectordinal, on the same counter -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.ordinal.title") }}</h2>
        <p class="body">{{ t("demo.ordinal.body") }}</p>
        <p class="widget" data-testid="ordinal">{{ t("demo.ordinal.message", { n: count }) }}</p>
      </section>

      <!-- ICU select: the value picks the whole sentence -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.select.title") }}</h2>
        <p class="body">{{ t("demo.select.body") }}</p>
        <div class="options">
          <button
            v-for="value in genders"
            :key="value"
            class="chip"
            :aria-pressed="gender === value"
            @click="gender = value"
          >
            {{ t(`demo.select.${value}`) }}
          </button>
        </div>
        <p class="widget" data-testid="select-message">
          {{ t("demo.select.message", { gender }) }}
        </p>
      </section>

      <!-- <T> with a tag: the catalog holds <link>…</link>, the app decides
           what that renders as. <T> is auto-imported too, and it passes the tag
           grammar per call, so plain `t()` elsewhere is unaffected. -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.tags.title") }}</h2>
        <p class="body">{{ t("demo.tags.body") }}</p>
        <p class="widget" data-testid="read-more">
          <T
            i18n-key="docs.read_more"
            :components="{
              link: {
                component: 'a',
                props: { href: 'https://comvi.io/docs', target: '_blank', rel: 'noreferrer' },
              },
            }"
          />
        </p>
      </section>

      <!-- date and number formatting, interpolated as params -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.formatting.title") }}</h2>
        <p class="body">{{ t("demo.formatting.body") }}</p>
        <p class="widget">
          {{
            t("stats.summary", {
              views: formatNumber(1234567),
              date: formatDate(RELEASED, { dateStyle: "long" }),
            })
          }}
        </p>
        <p class="widget">{{ t("demo.formatting.price", { price }) }}</p>
      </section>

      <!-- proof the loader is lazy: only the locales this browser has visited
           are here. Switch language and watch the list grow. -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.lazy.title") }}</h2>
        <p class="body">{{ t("demo.lazy.body") }}</p>
        <div class="network">
          <code data-testid="fetched">{{
            t("loader.fetched", { locales: fetched.join(", ") })
          }}</code>
          <code>{{ t("demo.lazy.namespaces", { namespaces: namespaces.join(", ") }) }}</code>
        </div>
      </section>

      <!-- fallback: uk has no `fallback.only_en`, so uk renders the en text;
           a key no catalog has renders as the key itself -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.fallback.title") }}</h2>
        <p class="body">{{ t("demo.fallback.body") }}</p>
        <p class="widget" data-testid="fallback">{{ t("fallback.only_en") }}</p>
        <p class="widget">
          <code data-testid="missing-key">{{ t("fallback.nowhere") }}</code>
        </p>
      </section>

      <!-- a missing parameter renders as its own placeholder -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.missing.title") }}</h2>
        <p class="body">{{ t("demo.missing.body") }}</p>
        <p class="widget" data-testid="missing-param">{{ t("greeting.hello", {}) }}</p>
      </section>

      <!-- a second page; <NuxtLinkLocale> keeps the current locale in the URL -->
      <section class="card">
        <h2 class="eyebrow">{{ t("demo.navigation.title") }}</h2>
        <p class="body">{{ t("demo.navigation.body") }}</p>
        <p class="widget">
          <NuxtLinkLocale class="cta" data-testid="nav-about" to="/about">{{
            t("demo.navigation.cta")
          }}</NuxtLinkLocale>
        </p>
      </section>
    </div>

    <AppFooter />
  </main>
</template>
