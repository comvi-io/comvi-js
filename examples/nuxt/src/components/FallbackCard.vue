<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <FeatureCard :title="t('demo.fallback.title')" :body="t('demo.fallback.body')">
    <!-- uk has no `fallback.only_en`, so `fallbackLocale: "en"` fills it in -->
    <p class="widget" data-testid="fallback">{{ t("fallback.only_en") }}</p>
    <p class="widget">
      <code data-testid="missing-key">{{ t("fallback.nowhere") }}</code>
    </p>
  </FeatureCard>
</template>
