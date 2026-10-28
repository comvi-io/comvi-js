<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import { useFormat } from "@comvi/vue/format";
import FeatureCard from "../components/FeatureCard.vue";

const RELEASED = new Date("2026-09-01T00:00:00Z");
const { t } = useI18n();
// Formatters in the language on screen: they change with it.
const format = useFormat();
</script>

<template>
  <FeatureCard feature="formatting">
    <p class="widget">
      {{
        t("stats.summary", {
          views: format.number(1234567),
          date: format.date(RELEASED, { dateStyle: "long", timeZone: "UTC" }),
        })
      }}
    </p>
    <p class="widget">
      {{ t("demo.formatting.price", { price: format.currency(1234.5, "EUR") }) }}
    </p>
  </FeatureCard>
</template>
