<script setup lang="ts">
const { t } = useI18n();
const name = useVisitorName();
</script>

<template>
  <main class="start">
    <AppHeader :intro="t('demo.start.intro')" />
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
    <p>
      <NuxtLinkLocale class="button" to="/features">{{ t("demo.start.cta") }}</NuxtLinkLocale>
    </p>
  </main>
</template>
