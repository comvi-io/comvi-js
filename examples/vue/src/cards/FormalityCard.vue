<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@comvi/vue";
import ChoiceChips from "../components/ChoiceChips.vue";
import FeatureCard from "../components/FeatureCard.vue";

const registers = ["formal", "informal"] as const;
const formality = ref<(typeof registers)[number]>("formal");
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="formality">
    <ChoiceChips
      v-model="formality"
      :values="registers"
      :label="(value) => t(`demo.formality.${value}`)"
    />
    <p class="widget" data-testid="formality-message">
      {{ t("demo.formality.message", { formality }) }}
    </p>
  </FeatureCard>
</template>
