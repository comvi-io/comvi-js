<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

// Auto-imported by the module — there is no `import { useI18n }` anywhere in a
// Nuxt app. `locales` and `defaultLocale` are Nuxt's own additions to
// @comvi/vue's composable, read from runtime config.
const { t, locale, locales, setLocale, isLoading, formatNumber, formatDate, loadedLocales } =
  useI18n();

// The locale lives in the URL, so switching NAVIGATES: `switchLocalePath(code)`
// is this same page's address in another language, and the module's route
// middleware pre-loads that catalog before the page renders.
const switchLocalePath = useSwitchLocalePath();

const count = ref(2);
const RELEASED = new Date("2026-09-01T00:00:00Z");

async function select(code: string) {
  if (code === locale.value) return;
  // `setLocale` first so the switch is instant — it loads the catalog and
  // advances the locale state the page is already bound to, rather than waiting
  // for the navigation to land. The route middleware would set the same locale
  // from the new URL anyway, so this is about the moment of the change, not
  // about correctness.
  await setLocale(code);
  await navigateTo(switchLocalePath(code));
}

// Read on the CLIENT only. The module builds one host per server request and a
// separate one in the browser, so the catalogs "fetched so far" is a fact about
// this browser — rendering it during SSR would print one list on the server and
// another after hydration.
const fetched = ref<string[]>([]);
onMounted(() => {
  fetched.value = loadedLocales.value;
});
watch([locale, isLoading], () => {
  fetched.value = loadedLocales.value;
});
</script>

<template>
  <main>
    <h1>{{ t("app.title") }}</h1>

    <!-- 1 — locale switcher -->
    <section>
      <h2>{{ t("app.language") }}</h2>
      <div class="row">
        <button
          v-for="code in locales"
          :key="code"
          :data-testid="`locale-${code}`"
          :aria-pressed="locale === code"
          @click="select(code)"
        >
          {{ code }}
        </button>
        <code v-if="isLoading">{{ t("app.loading") }}</code>
      </div>
    </section>

    <!-- 2 — a string with a parameter -->
    <section>
      <h2>interpolation</h2>
      <p data-testid="greeting">{{ t("greeting.hello", { name: "Ada" }) }}</p>
    </section>

    <!-- 3 — an ICU plural, live on a counter. The compiler was named in
         `comvi.host.ts`; the module's own generated host would render the
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
  </main>
</template>
