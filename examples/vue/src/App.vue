<script setup lang="ts">
import { onMounted, onUnmounted, ref, watchEffect } from "vue";
import { T, useI18n } from "@comvi/vue";
import { locales, rtlLocale } from "./i18n";

// `locale`, `dir` and `isLoading` are refs, so the template re-renders on a
// locale change; `t` and the formatters read the current locale on every call.
const {
  t,
  locale,
  setLocale,
  dir,
  isLoading,
  isInitializing,
  formatNumber,
  formatDate,
  loadedLocales,
} = useI18n();

const count = ref(2);
const RELEASED = new Date("2026-09-01T00:00:00Z");

// The greeting's `{name}`: "Ada", or `?name=…` from the address bar. Whatever
// arrives there is a parameter, and a parameter is rendered as text, never as
// markup: try `?name=<b>Grace</b>`.
const name = new URLSearchParams(location.search).get("name") ?? "Ada";

// A second view, so the locale can be seen surviving a navigation. No router
// dependency: `history.pushState` and `popstate` are the whole of it, and
// `vite preview` serves index.html for /about on a reload.
type View = "home" | "about";
const viewFromPath = (): View => (location.pathname === "/about" ? "about" : "home");
const view = ref<View>(viewFromPath());
const onPop = () => (view.value = viewFromPath());
onMounted(() => window.addEventListener("popstate", onPop));
onUnmounted(() => window.removeEventListener("popstate", onPop));
function go(to: View) {
  history.pushState(null, "", to === "about" ? "/about" : "/");
  view.value = to;
}

watchEffect(() => {
  document.documentElement.lang = locale.value;
  document.documentElement.dir = dir.value;
});
</script>

<template>
  <!-- `app.use(i18n)` starts `init()`; until the first catalog is in, show this
       rather than raw keys. -->
  <p v-if="isInitializing">Loading…</p>
  <main v-else>
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
          @click="setLocale(code)"
        >
          {{ code }}
        </button>
        <!-- Not in the switcher: the right-to-left locale the e2e suite uses. -->
        <button hidden :data-testid="`locale-${rtlLocale}`" @click="setLocale(rtlLocale)">
          {{ rtlLocale }}
        </button>
        <code v-if="isLoading">{{ t("app.loading") }}</code>
      </div>
    </section>

    <section v-if="view === 'about'">
      <h2>navigation</h2>
      <p data-testid="about-body">{{ t("about.body") }}</p>
      <p>
        <a data-testid="nav-home" href="/" @click.prevent="go('home')">{{ t("nav.home") }}</a>
      </p>
    </section>
    <template v-else>
      <!-- 2 — a string with a parameter -->
      <section>
        <h2>interpolation</h2>
        <p data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
      </section>

      <!-- 3 — an ICU plural, live on a counter -->
      <section>
        <h2>plural</h2>
        <div class="row">
          <button data-testid="cart-dec" @click="count = Math.max(0, count - 1)">−</button>
          <button data-testid="cart-inc" @click="count++">+</button>
          <span data-testid="cart">{{ t("cart.items", { count }) }}</span>
        </div>
      </section>

      <!-- 4 — <T> with a tag: the catalog holds <link>…</link>, the app decides
         what that renders as. The tag grammar travels per call, so plain
         `t()` elsewhere is unaffected. -->
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

      <!-- 6 — proof the loader is lazy: only the locales you visited are here -->
      <section>
        <h2>lazy loading</h2>
        <p>
          <code data-testid="fetched">{{
            t("loader.fetched", { locales: loadedLocales.join(", ") })
          }}</code>
        </p>
      </section>

      <!-- 7 — a second view; the locale is not part of the path here -->
      <section>
        <h2>navigation</h2>
        <p>
          <a data-testid="nav-about" href="/about" @click.prevent="go('about')">{{
            t("nav.about")
          }}</a>
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
    </template>
  </main>
</template>
