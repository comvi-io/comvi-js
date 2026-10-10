<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <FeatureCard :title="t('demo.errors.title')" :body="t('demo.errors.body')">
    <!-- Counted in the browser only, so the server's HTML has nothing to disagree with. -->
    <ClientOnly>
      <p class="widget" data-testid="missing-count">
        {{ t("demo.errors.count", { count: missingKeys }) }}
      </p>
    </ClientOnly>
  </FeatureCard>
</template>
