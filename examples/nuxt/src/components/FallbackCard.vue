<script setup lang="ts">
const { t } = useI18n();
// @ts-expect-error: no catalog has this key, so the generated types reject it
const nowhere = () => t("fallback.nowhere");
</script>

<template>
  <FeatureCard :title="t('demo.fallback.title')" :body="t('demo.fallback.body')">
    <!-- uk has no `fallback.only_en`, so `fallbackLocale: "en"` fills it in -->
    <p class="widget" data-testid="fallback">{{ t("fallback.only_en") }}</p>
    <p class="widget">
      <code data-testid="missing-key">{{ nowhere() }}</code>
    </p>
  </FeatureCard>
</template>
