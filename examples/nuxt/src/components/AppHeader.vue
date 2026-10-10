<script setup lang="ts">
const { t } = useI18n();

defineProps<{ intro?: string }>();
</script>

<template>
  <header class="hero">
    <h1>{{ t("app.title") }}</h1>
    <p class="intro">{{ intro ?? t("demo.intro") }}</p>
    <LocaleSwitcher />
  </header>
</template>
