<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@comvi/vue";
import ChoiceChips from "../components/ChoiceChips.vue";
import FeatureCard from "../components/FeatureCard.vue";

const genders = ["female", "male", "other"] as const;
const gender = ref<(typeof genders)[number]>("female");
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="select">
    <ChoiceChips v-model="gender" :values="genders" :label="(value) => t(`demo.select.${value}`)" />
    <p class="widget" data-testid="select-message">{{ t("demo.select.message", { gender }) }}</p>
  </FeatureCard>
</template>
