<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const { t } = useI18n();
// @ts-expect-error: no catalog has this key, so the generated types reject it
const nowhere = () => t("fallback.nowhere");
</script>

<template>
  <FeatureCard feature="fallback">
    <!-- Missing from uk.json: Ukrainian shows the English sentence. -->
    <p class="widget" data-testid="fallback">{{ t("fallback.only_en") }}</p>
    <!-- In no catalog at all: the key itself shows. -->
    <p class="widget">
      <code data-testid="missing-key">{{ nowhere() }}</code>
    </p>
  </FeatureCard>
</template>
