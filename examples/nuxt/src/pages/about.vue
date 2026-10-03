<script setup lang="ts">
// The second page. The module clones every page under `pages/` into each
// locale prefix, so this is /en/about, /uk/about and /de/about, and
// <NuxtLinkLocale> takes the way back to `/` in the same language.
const { t } = useI18n();
</script>

<template>
  <main>
    <h1>{{ t("app.title") }}</h1>
    <section>
      <h2>navigation</h2>
      <p data-testid="about-body">{{ t("about.body") }}</p>
      <p>
        <NuxtLinkLocale data-testid="nav-home" to="/">{{ t("nav.home") }}</NuxtLinkLocale>
      </p>
    </section>
  </main>
</template>
