<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="missing">
    <p class="widget" data-testid="missing-param">{{ t("greeting.hello", {}) }}</p>
  </FeatureCard>
</template>
