<script setup lang="ts">
import { watchEffect } from "vue";
import { RouterView } from "vue-router";
import { useI18n } from "@comvi/vue";
import { locales, rtlLocale } from "./i18n";

// The page frame both routes share: header with the switcher, the route, the
// footer. `locale`, `dir` and `isLoading` are refs, so the template re-renders
// on a locale change; `t` reads the current locale on every call.
const { t, locale, setLocale, dir, isLoading, isInitializing } = useI18n();

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
    <header>
      <h1>{{ t("app.title") }}</h1>
      <p class="intro">{{ t("demo.intro") }}</p>
      <div class="switcher-row">
        <span id="language-label" class="label">{{ t("app.language") }}</span>
        <div class="switcher" role="group" aria-labelledby="language-label">
          <button
            v-for="code in locales"
            :key="code"
            :data-testid="`locale-${code}`"
            :aria-pressed="locale === code"
            @click="setLocale(code)"
          >
            {{ code }}
          </button>
        </div>
        <!-- Not in the switcher: the right-to-left locale the e2e suite uses. -->
        <button hidden :data-testid="`locale-${rtlLocale}`" @click="setLocale(rtlLocale)">
          {{ rtlLocale }}
        </button>
        <span v-if="isLoading" class="status">{{ t("app.loading") }}</span>
      </div>
    </header>

    <RouterView />

    <footer>
      <a href="https://comvi.io/docs/i18n">{{ t("demo.footer.docs") }}</a>
      <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/vue">{{
        t("demo.footer.source")
      }}</a>
      <span>
        {{ t("demo.footer.install") }}
        <code>npm i @comvi/vue</code>
      </span>
    </footer>
  </main>
</template>
