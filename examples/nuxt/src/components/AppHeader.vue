<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <header class="hero">
    <h1>{{ t("app.title") }}</h1>
    <p class="intro">{{ t("demo.intro") }}</p>
    <LocaleSwitcher />
  </header>
</template>
