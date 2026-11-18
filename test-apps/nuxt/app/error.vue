<script setup lang="ts">
// A translated error page: rendered by Nuxt's own error render, with the same instance rules.
defineProps<{ error: { statusCode: number } }>();
const { t } = useI18n();
</script>

<template>
  <main>
    <h1 data-testid="error-title">{{ t("home.title") }}</h1>
    <p data-testid="error-code">{{ error.statusCode }}</p>
  </main>
</template>
