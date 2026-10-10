<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <FeatureCard :title="t('demo.missing.title')" :body="t('demo.missing.body')">
    <p class="widget" data-testid="missing-param">{{ t("greeting.hello", {}) }}</p>
  </FeatureCard>
</template>
