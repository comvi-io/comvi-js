<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";
import { missingKeys } from "../i18n";

const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="errors">
    <p class="widget" data-testid="missing-count">
      {{ t("demo.errors.count", { count: missingKeys }) }}
    </p>
  </FeatureCard>
</template>
