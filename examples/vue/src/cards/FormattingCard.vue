<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const RELEASED = new Date("2026-09-01T00:00:00Z");
const { t, locale, formatNumber, formatDate } = useI18n();
const price = computed(() =>
  new Intl.NumberFormat(locale.value, { style: "currency", currency: "EUR" }).format(1234.5),
);
</script>

<template>
  <FeatureCard feature="formatting">
    <p class="widget">
      {{
        t("stats.summary", {
          views: formatNumber(1234567),
          date: formatDate(RELEASED, { dateStyle: "long", timeZone: "UTC" }),
        })
      }}
    </p>
    <p class="widget">{{ t("demo.formatting.price", { price }) }}</p>
  </FeatureCard>
</template>
