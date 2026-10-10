<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

defineProps<{ name: string }>();
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="interpolation">
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
  </FeatureCard>
</template>
