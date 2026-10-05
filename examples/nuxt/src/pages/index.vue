<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

// Auto-imported by the module — there is no `import { useI18n }` anywhere in a
// Nuxt app.
const { t, locale, isLoading, formatNumber, formatDate, loadedLocales } = useI18n();

const count = ref(2);

// The greeting's `{name}`: "Ada", or `?name=…` from the address bar, on the
// server and in the browser alike. Whatever arrives there is a parameter, and a
// parameter is rendered as text, never as markup: try `?name=<b>Grace</b>`.
const route = useRoute();
const name = computed(() => (typeof route.query.name === "string" ? route.query.name : "Ada"));

const RELEASED = new Date("2026-09-01T00:00:00Z");

// Read on the CLIENT only. The module builds one instance per server request and a
// separate one in the browser, so the catalogs "fetched so far" is a fact about
// this browser — rendering it during SSR would print one list on the server and
// another after hydration.
const fetched = ref<string[]>([]);
onMounted(() => {
  fetched.value = loadedLocales.value;
  // A marker for the e2e suite: set once Vue has hydrated this page, so a test
  // can tell the server's HTML from the live page.
  document.documentElement.dataset.hydrated = "true";
});
watch([locale, isLoading], () => {
  fetched.value = loadedLocales.value;
});
</script>

<template>
  <main>
    <h1>{{ t("app.title") }}</h1>

    <!-- 1 — locale switcher, `components/LocaleSwitcher.vue` -->
    <LocaleSwitcher />

    <!-- 2 — a string with a parameter -->
    <section>
      <h2>interpolation</h2>
      <p data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
    </section>

    <!-- 3 — an ICU plural, live on a counter. The compiler was named in
         `comvi.host.ts`; the module's own generated instance would render the
         braced segment literally. -->
    <section>
      <h2>plural</h2>
      <div class="row">
        <button data-testid="cart-dec" @click="count = Math.max(0, count - 1)">−</button>
        <button data-testid="cart-inc" @click="count++">+</button>
        <span data-testid="cart">{{ t("cart.items", { count }) }}</span>
      </div>
    </section>

    <!-- 4 — <T> with a tag: the catalog holds <link>…</link>, the app decides
         what that renders as. <T> is auto-imported too, and it passes the tag
         grammar per call, so plain `t()` elsewhere is unaffected. -->
    <section>
      <h2>tag interpolation</h2>
      <p data-testid="read-more">
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

    <!-- 5 — date and number formatting, interpolated as params -->
    <section>
      <h2>formatting</h2>
      <p>
        {{
          t("stats.summary", {
            views: formatNumber(1234567),
            date: formatDate(RELEASED, { dateStyle: "long" }),
          })
        }}
      </p>
    </section>

    <!-- 6 — proof the loader is lazy: only the locales this browser has visited
         are here. Switch language and watch the list grow. -->
    <section>
      <h2>lazy loading</h2>
      <p>
        <code data-testid="fetched">{{
          t("loader.fetched", { locales: fetched.join(", ") })
        }}</code>
      </p>
    </section>

    <!-- 7 — a second page; <NuxtLinkLocale> keeps the current locale in the URL -->
    <section>
      <h2>navigation</h2>
      <p>
        <NuxtLinkLocale data-testid="nav-about" to="/about">{{ t("nav.about") }}</NuxtLinkLocale>
      </p>
    </section>

    <!-- 8 — fallback: uk has no `fallback.only_en`, so uk renders the en text;
         a key no catalog has renders as the key itself -->
    <section>
      <h2>fallback</h2>
      <p data-testid="fallback">{{ t("fallback.only_en") }}</p>
      <p>
        <code data-testid="missing-key">{{ t("fallback.nowhere") }}</code>
      </p>
    </section>

    <!-- 9 — a missing parameter renders as its own placeholder -->
    <section>
      <h2>missing parameter</h2>
      <p data-testid="missing-param">{{ t("greeting.hello", {}) }}</p>
    </section>
  </main>
</template>
