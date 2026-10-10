<script setup lang="ts">
const { t } = useI18n();

// The same counter as the plural card: one piece of shared state, two rules.
const count = useState("count", () => 2);
</script>

<template>
  <FeatureCard :title="t('demo.ordinal.title')" :body="t('demo.ordinal.body')">
    <p class="widget" data-testid="ordinal">{{ t("demo.ordinal.message", { n: count }) }}</p>
  </FeatureCard>
</template>
