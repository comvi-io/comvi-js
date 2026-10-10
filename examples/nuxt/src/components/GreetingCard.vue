<script setup lang="ts">
const { t } = useI18n();

// `?name=…` from the address bar, rendered as text and never as markup:
// try `?name=<b>Grace</b>`.
const route = useRoute();
const name = computed(() => (typeof route.query.name === "string" ? route.query.name : "Ada"));
</script>

<template>
  <FeatureCard :title="t('demo.interpolation.title')" :body="t('demo.interpolation.body')">
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
  </FeatureCard>
</template>
