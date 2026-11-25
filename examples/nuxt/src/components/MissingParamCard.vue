<script setup lang="ts">
const { t } = useI18n();
// @ts-expect-error: the generated types require `name`; this shows what renders without it
const withoutName = () => t("greeting.hello", {});
</script>

<template>
  <FeatureCard :title="t('demo.missing.title')" :body="t('demo.missing.body')">
    <p class="widget" data-testid="missing-param">{{ withoutName() }}</p>
  </FeatureCard>
</template>
