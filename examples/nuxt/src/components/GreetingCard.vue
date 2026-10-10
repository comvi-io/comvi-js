<script setup lang="ts">
const { t } = useI18n();

// Rendered as text and never as markup: try `?name=<b>Grace</b>`.
const name = useVisitorName();
</script>

<template>
  <FeatureCard :title="t('demo.interpolation.title')" :body="t('demo.interpolation.body')">
    <label class="field">
      <span>{{ t("demo.interpolation.label") }}</span>
      <input v-model="name" data-testid="name-input" type="text" autocomplete="off" />
    </label>
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
  </FeatureCard>
</template>
