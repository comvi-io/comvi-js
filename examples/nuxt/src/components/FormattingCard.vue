<script setup lang="ts">
const { t, locale, formatNumber, formatDate } = useI18n();

const released = new Date("2026-09-01T00:00:00Z");
const price = computed(() =>
  new Intl.NumberFormat(locale.value, { style: "currency", currency: "EUR" }).format(1234.5),
);
</script>

<template>
  <FeatureCard :title="t('demo.formatting.title')" :body="t('demo.formatting.body')">
    <p class="widget">
      {{
        t("stats.summary", {
          views: formatNumber(1234567),
          date: formatDate(released, { dateStyle: "long" }),
        })
      }}
    </p>
    <p class="widget">{{ t("demo.formatting.price", { price }) }}</p>
  </FeatureCard>
</template>
