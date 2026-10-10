<script setup lang="ts">
const { t } = useI18n();

const genders = ["female", "male", "other"] as const;
const gender = useState<(typeof genders)[number]>("gender", () => "female");
</script>

<template>
  <FeatureCard :title="t('demo.select.title')" :body="t('demo.select.body')">
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
