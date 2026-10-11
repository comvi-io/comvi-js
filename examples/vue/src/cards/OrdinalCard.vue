<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

defineProps<{ count: number }>();
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="ordinal">
    <p class="widget" data-testid="ordinal">{{ t("demo.ordinal.message", { n: count }) }}</p>
  </FeatureCard>
</template>
