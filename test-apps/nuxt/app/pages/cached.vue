<script setup lang="ts">
// Cached by routeRules (nuxt.config): one render serves everyone until it expires.
const { t } = useI18n();
</script>

<template>
  <h1 data-testid="title">{{ t("home.title") }}</h1>
</template>
