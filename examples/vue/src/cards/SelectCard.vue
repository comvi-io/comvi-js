<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const genders = ["female", "male", "other"] as const;
const gender = ref<(typeof genders)[number]>("female");
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="select">
    <div class="options">
      <button
        v-for="value in genders"
        :key="value"
        class="chip"
        :aria-pressed="gender === value"
        @click="gender = value"
      >
        {{ t(`demo.select.${value}`) }}
      </button>
    </div>
    <p class="widget" data-testid="select-message">{{ t("demo.select.message", { gender }) }}</p>
  </FeatureCard>
</template>
