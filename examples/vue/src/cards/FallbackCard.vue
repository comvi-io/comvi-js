<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="fallback">
    <!-- Missing from uk.json: Ukrainian shows the English sentence. -->
    <p class="widget" data-testid="fallback">{{ t("fallback.only_en") }}</p>
    <!-- In no catalog at all: the key itself shows. -->
    <p class="widget">
      <code data-testid="missing-key">{{ t("fallback.nowhere") }}</code>
    </p>
  </FeatureCard>
</template>
