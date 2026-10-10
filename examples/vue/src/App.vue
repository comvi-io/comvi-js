<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { RouterView, useRoute } from "vue-router";
import { useI18n } from "@comvi/vue";
import AppFooter from "./components/AppFooter.vue";
import LocaleSwitcher from "./components/LocaleSwitcher.vue";

const { t, locale, dir, isInitializing } = useI18n();

// The start page stays minimal: its own one-line intro and no footer.
const route = useRoute();
const isStart = computed(() => route.path === "/");

// Arabic flips the whole document to right-to-left.
watchEffect(() => {
  document.documentElement.lang = locale.value;
  document.documentElement.dir = dir.value;
});
</script>

<template>
  <!-- Until the first catalog is in there are no words to show, raw keys
       included, so this is a wordless spinner. -->
  <div v-if="isInitializing" class="boot" role="status" aria-busy="true" />
  <main v-else>
    <header>
      <h1>{{ t("app.title") }}</h1>
      <p class="intro">{{ t(isStart ? "demo.start.intro" : "demo.intro") }}</p>
      <LocaleSwitcher />
    </header>

    <RouterView />

    <AppFooter v-if="!isStart" />
  </main>
</template>
