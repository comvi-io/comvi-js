<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { T, useI18n } from "@comvi/vue";
import { locales } from "./i18n";

// `locale`, `dir` and `isLoading` are refs, so the template re-renders on a
// locale change; `t` and the formatters read the current locale on every call.
const { t, locale, setLocale, dir, isLoading, formatNumber, formatDate, loadedLocales } = useI18n();

const count = ref(2);
const RELEASED = new Date("2026-09-01T00:00:00Z");

watchEffect(() => {
  document.documentElement.lang = locale.value;
  document.documentElement.dir = dir.value;
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
          :aria-pressed="locale === code"
          @click="setLocale(code)"
        >
          {{ code }}
        </button>
        <code v-if="isLoading">{{ t("app.loading") }}</code>
      </div>
    </section>

    <!-- 2 — a string with a parameter -->
    <section>
      <h2>interpolation</h2>
      <p>{{ t("greeting.hello", { name: "Ada" }) }}</p>
    </section>

    <!-- 3 — an ICU plural, live on a counter -->
    <section>
      <h2>plural</h2>
      <div class="row">
        <button @click="count = Math.max(0, count - 1)">−</button>
        <button @click="count++">+</button>
        <span>{{ t("cart.items", { count }) }}</span>
      </div>
    </section>

    <!-- 4 — <T> with a tag: the catalog holds <link>…</link>, the app decides
         what that renders as. The tag grammar travels per call, so plain
         `t()` elsewhere is unaffected. -->
    <section>
      <h2>tag interpolation</h2>
      <p>
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
        <code>{{ t("loader.fetched", { locales: loadedLocales.join(", ") }) }}</code>
      </p>
    </section>
  </main>
</template>
