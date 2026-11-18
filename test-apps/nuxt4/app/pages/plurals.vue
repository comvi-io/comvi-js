<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <section>
    <h1>{{ t("plurals.title") }}</h1>
    <p v-for="n in [0, 1, 5]" :key="n" :data-testid="`plural-${n}`">
      {{ t("plurals.notifications", { count: n }) }}
    </p>
  </section>
</template>
