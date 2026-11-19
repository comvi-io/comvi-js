<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <section id="region-B">
    <h1 id="B-title">{{ t("home.title") }}</h1>
    <p id="B-rich"><T i18n-key="rich.terms" :components="{ b: 'b' }" /></p>
  </section>
</template>
