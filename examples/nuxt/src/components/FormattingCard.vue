<script setup lang="ts">
const { t, locale } = useI18n();
// The formatters in the language on screen; dates in the app's one time zone (comvi.timeZone).
const { number, date } = useFormat();

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
          views: number(1234567),
          date: date(released, { dateStyle: "long" }),
        })
      }}
    </p>
    <p class="widget">{{ t("demo.formatting.price", { price }) }}</p>
  </FeatureCard>
</template>
