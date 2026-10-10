<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";
import { useVisitorName } from "../name";

const { t } = useI18n();
const name = useVisitorName();
</script>

<template>
  <FeatureCard feature="interpolation">
    <label class="field">
      <span>{{ t("demo.interpolation.label") }}</span>
      <input v-model="name" data-testid="name-input" />
    </label>
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
  </FeatureCard>
</template>
