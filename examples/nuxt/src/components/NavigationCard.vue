<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <FeatureCard :title="t('demo.navigation.title')" :body="t('demo.navigation.body')">
    <p class="widget">
      <!-- <NuxtLinkLocale> keeps the current locale prefix in the URL -->
      <NuxtLinkLocale class="cta" data-testid="nav-about" to="/about">{{
        t("demo.navigation.cta")
      }}</NuxtLinkLocale>
    </p>
  </FeatureCard>
</template>
