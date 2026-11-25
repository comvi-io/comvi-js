<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const { t } = useI18n();
// @ts-expect-error: the generated types require `name`; this shows what renders without it
const withoutName = () => t("greeting.hello", {});
</script>

<template>
  <FeatureCard feature="missing">
    <p class="widget" data-testid="missing-param">{{ withoutName() }}</p>
  </FeatureCard>
</template>
